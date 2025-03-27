/**
 * 用于本地测试GitHub webhook的实用工具
 * 将从环境变量中读取webhook密钥，并生成正确的签名
 */
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// 从环境变量读取Webhook密钥
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('错误: WEBHOOK_SECRET环境变量未设置');
  process.exit(1);
}

// 测试webhook URL
const WEBHOOK_URL = 'http://localhost:3000';

// 创建签名
function createSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const signature = hmac.update(JSON.stringify(payload)).digest('hex');
  return `sha256=${signature}`;
}

/**
 * 发送测试webhook
 * @param {string} event GitHub事件类型，如'repository'
 * @param {Object} payload webhook负载
 */
async function sendTestWebhook(event, payload) {
  // 确保payload是对象
  if (typeof payload !== 'object') {
    throw new Error('Payload必须是一个对象');
  }
  
  const payloadString = JSON.stringify(payload);
  const signature = createSignature(payload, WEBHOOK_SECRET);
  const deliveryId = crypto.randomBytes(16).toString('hex');
  
  console.log(`正在发送测试webhook (${event})...`);
  console.log(`X-GitHub-Delivery: ${deliveryId}`);
  console.log(`X-GitHub-Event: ${event}`);
  console.log(`X-Hub-Signature-256: ${signature}`);
  
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': event,
        'X-GitHub-Delivery': deliveryId,
        'X-Hub-Signature-256': signature,
        'User-Agent': 'GitHub-Hookshot/Test'
      }
    });
    
    console.log('响应状态:', response.status);
    console.log('响应数据:', response.data);
    return response;
  } catch (error) {
    console.error('请求失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    throw error;
  }
}

// 示例：测试repository.created事件
async function testRepositoryCreated() {
  const payload = {
    action: 'created',
    repository: {
      name: 'intl-test-repo',
      owner: {
        login: 'test-org'
      }
    }
  };
  
  try {
    await sendTestWebhook('repository', payload);
    console.log('测试成功完成!');
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

// 执行测试
testRepositoryCreated();
