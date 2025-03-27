/**
 * 自定义Probot服务器启动文件
 * 集成详细日志中间件
 */
const { createProbot, createNodeMiddleware } = require('probot');
const pino = require('pino');
const app = require('./index.js');
const loggingMiddleware = require('./logging-middleware');
const express = require('express');
const { resolve } = require('path');
const fs = require('fs');

// 加载环境变量
require('dotenv').config();

// 创建一个自定义的日志记录器
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

async function start() {
  // 创建Probot实例
  const probot = createProbot({
    appId: process.env.APP_ID,
    privateKey: process.env.PRIVATE_KEY,
    secret: process.env.WEBHOOK_SECRET,
    log: logger,
    logLevel: process.env.LOG_LEVEL || 'info',
    webhookPath: '/',
    webhookProxy: process.env.WEBHOOK_PROXY_URL,
  });

  // 创建Express应用
  const expressApp = express();
  
  // 注册我们的日志中间件
  expressApp.use(loggingMiddleware(logger));
  
  // 添加请求体解析中间件，增强错误处理
  expressApp.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
    // 添加JSON解析错误处理
    reviver: (key, value) => {
      return value;
    }
  }));
  expressApp.use(express.urlencoded({ extended: true }));
  
  // 添加JSON解析错误处理中间件
  expressApp.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      logger.error('JSON解析错误:', {
        error: err.message,
        body: req.rawBody,
        headers: req.headers
      });
      return res.status(400).json({ error: '无效的JSON格式', details: err.message });
    }
    next(err);
  });
  
  // 添加详细的请求记录中间件
  expressApp.use((req, res, next) => {
    logger.debug('详细的请求信息:', {
      method: req.method,
      url: req.url,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: req.body,
      rawBody: req.rawBody,
      'x-github-event': req.headers['x-github-event'],
      'x-github-delivery': req.headers['x-github-delivery'],
      'x-hub-signature': req.headers['x-hub-signature'],
      'x-hub-signature-256': req.headers['x-hub-signature-256'],
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    });
    
    // 如果是 POST 请求，记录更多细节
    if (req.method === 'POST') {
      logger.debug('POST请求详细信息:', {
        完整请求头: req.headers,
        请求体: req.body,
        原始请求体: req.rawBody
      });
    }
    
    next();
  });
  
  // 添加一个简单的测试路由
  expressApp.get('/test', (req, res) => {
    logger.info('测试路由被访问');
    res.status(200).send('服务器正在运行');
  });
  
  // 添加一个健康检查路由
  expressApp.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      app: 'cursorignore-checker',
      appId: process.env.APP_ID || 'unknown'
    });
  });
  
  // 添加一个手动触发webhook测试的路由
  expressApp.post('/debug/webhook', (req, res) => {
    logger.info('手动触发webhook测试');
    
    // 记录请求详情
    logger.debug('手动webhook测试详情:', {
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody
    });
    
    res.status(200).json({
      success: true,
      message: '收到手动webhook测试请求',
      receivedAt: new Date().toISOString()
    });
  });
  
  // 添加一个可以打印所有请求头部的路由，用于调试
  expressApp.post('/debug-headers', (req, res) => {
    logger.info('收到调试请求，打印所有头部');
    res.status(200).json({
      headers: req.headers,
      body: req.body
    });
  });

  // 添加自定义的中间件来调试webhook问题
  expressApp.use('/', (req, res, next) => {
    if (req.method === 'POST') {
      // 只在debug级别记录详细信息，避免在info级别重复
      logger.debug('完整请求详情：', {
        url: req.url,
        method: req.method,
        path: req.path,
        headers: JSON.stringify(req.headers),
        allHeaderKeys: Object.keys(req.headers),
        body: JSON.stringify(req.body),
        'x-github-event': req.headers['x-github-event'],
        'x-github-delivery': req.headers['x-github-delivery'],
        'x-hub-signature': req.headers['x-hub-signature'],
        'x-hub-signature-256': req.headers['x-hub-signature-256'],
        signatureHeaderExists: !!req.headers['x-hub-signature'] || !!req.headers['x-hub-signature-256']
      });
      
      // 检查Smee.io相关头部
      if (req.headers['x-github-event'] && !req.headers['x-hub-signature'] && !req.headers['x-hub-signature-256']) {
        logger.warn('可能是Smee.io转发问题: 发现GitHub事件头部但没有签名头部');
      }
      
      // 检查必要的webhook头部
      const requiredHeaders = ['x-github-event', 'x-github-delivery'];
      const missingHeaders = requiredHeaders.filter(header => !req.headers[header]);
      
      if (missingHeaders.length > 0) {
        logger.error(`缺少必要的webhook头部: ${missingHeaders.join(', ')}`);
        return res.status(400).json({
          error: '无效的webhook请求',
          details: `缺少必要的头部: ${missingHeaders.join(', ')}`,
          solution: '请确保请求包含有效的GitHub webhook头部'
        });
      }
      
      // 特别处理smee.io转发的请求
      if (req.headers['x-github-event'] && process.env.WEBHOOK_SECRET &&
          !req.headers['x-hub-signature'] && !req.headers['x-hub-signature-256'] &&
          req.headers['user-agent'] && req.headers['user-agent'].includes('smee')) {
        
        logger.warn('可能是smee.io代理转发问题: 暂时略过签名验证');
        // 如果确定是smee.io转发的请求，且未包含签名，则继续处理
        return next();
      }
      
      // 检查是否需要签名验证（如果配置了webhook secret）
      if (process.env.WEBHOOK_SECRET) {
        const signature = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
        if (!signature) {
          logger.error('缺少webhook签名但配置了secret');
          return res.status(400).json({
            error: '无效的webhook请求',
            details: '缺少签名头部',
            solution: '请确保请求包含x-hub-signature或x-hub-signature-256头部'
          });
        }
      }
    }
    next();
  });
  
  // 添加Probot的webhook中间件
  expressApp.use(createNodeMiddleware(app, { probot }));
  
  // 添加额外的路由信息记录
  expressApp.get('*', (req, res, next) => {
    logger.debug(`路由访问: ${req.method} ${req.path}`, {
      headers: req.headers,
      query: req.query,
      params: req.params,
      originalUrl: req.originalUrl
    });
    next();
  });

  // 添加错误处理中间件到更早的位置
  expressApp.use((err, req, res, next) => {
    // 检查是否是Probot的webhook验证错误
    if (err.name === 'WebhookVerificationError') {
      logger.error('Webhook验证失败:', {
        error: err.message,
        name: err.name,
        code: err.code,
        stack: err.stack,
        headers: req.headers,
        'x-github-event': req.headers['x-github-event'],
        'x-github-delivery': req.headers['x-github-delivery']
      });
      
      return res.status(400).json({
        error: '无效的Webhook签名',
        name: err.name,
        details: '请确保Webhook密钥配置正确'
      });
    }
    
    // 检查是否是请求验证相关的错误
    if (req.method === 'POST' && req.path === '/' && 
        (err.message?.includes('webhook') || err.message?.includes('signature') || 
         err.message?.includes('verification') || err.message?.includes('secret'))) {
      // 使用debug级别记录详细诊断信息
      logger.debug('webhook验证诊断信息:', {
        errorMessage: err.message,
        errorName: err.name,
        errorStack: err.stack,
        errorCode: err.code,
        webhookSecret: process.env.WEBHOOK_SECRET ? '已设置' : '未设置',
        appId: process.env.APP_ID,
        headers: req.headers
      });
    }
    
    // 统一的错误日志记录
    logger.error('请求处理错误:', {
      error: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
      url: req.url,
      method: req.method
    });
    
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: err.message,
        name: err.name,
        code: err.code,
        details: err.details || '未知错误'
      });
    }
  });

  // 启动服务器
  const port = process.env.PORT || 3000;
  const server = expressApp.listen(port, () => {
    logger.info(`服务器启动在 http://localhost:${port}`);
    logger.info(`应用ID: ${process.env.APP_ID}`);
    logger.info(`Webhook代理: ${process.env.WEBHOOK_PROXY_URL || '无'}`);
    logger.info(`Webhook密钥设置状态: ${process.env.WEBHOOK_SECRET ? '已设置' : '未设置'}`);
    
    // 添加调试信息
    logger.debug('服务器环境变量:', {
      APP_ID: process.env.APP_ID,
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ? '已设置(不显示实际值)' : '未设置',
      PRIVATE_KEY: process.env.PRIVATE_KEY ? '已设置(不显示实际值)' : '未设置',
      WEBHOOK_PROXY_URL: process.env.WEBHOOK_PROXY_URL
    });
  });
}

// 启动服务器
start().catch(error => {
  console.error('启动失败:', error);
  process.exit(1);
}); 