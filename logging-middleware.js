/**
 * 自定义日志中间件，用于记录请求和响应的详细信息
 */
module.exports = function loggingMiddleware(logger) {
  return (req, res, next) => {
    // 记录请求开始
    const start = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    // 获取调用栈信息
    const stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/i;
    const stackReg2 = /at\s+()(.*):(\d*):(\d*)/i;
    const stacklist = (new Error()).stack.split('\n').slice(3);
    const s = stacklist[0];
    const sp = stackReg.exec(s) || stackReg2.exec(s);
    
    let fileInfo = '';
    if (sp && sp.length === 5) {
      fileInfo = `[${sp[2]}:${sp[3]}] `;
    }
    
    // 请求详情
    logger.debug(`${fileInfo}[REQUEST-${requestId}] ${req.method} ${req.url}`, {
      headers: req.headers,
      query: req.query,
      body: req.body,
      ip: req.ip,
      path: req.path,
      originalUrl: req.originalUrl,
    });
    
    // 捕获响应完成事件
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'error' : 'info';
      
      // 响应详情
      logger[level](`${fileInfo}[RESPONSE-${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
        status: res.statusCode,
        duration,
        statusMessage: res.statusMessage,
        headers: res.getHeaders(),
      });
      
      // 如果是错误状态码，记录更多详细信息
      if (res.statusCode >= 400) {
        logger.error(`${fileInfo}[ERROR-${requestId}] 请求出错: ${req.method} ${req.originalUrl}`, {
          url: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          requestBody: JSON.stringify(req.body),
          requestQuery: req.query,
          requestHeaders: req.headers,
          responseHeaders: res.getHeaders(),
          errorMessage: res.statusMessage,
          stack: stacklist.join('\n')
        });
      }
    });
    
    next();
  };
}; 