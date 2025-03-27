/**
 * Probot应用：检查组织中新项目是否包含.cursorignore文件
 * 如果不存在，则自动创建PR提交该文件
 */

// 自定义日志格式化，包含文件名、行号和堆栈信息
const getFileInfo = () => {
  const stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/i;
  const stackReg2 = /at\s+()(.*):(\d*):(\d*)/i;
  const stacklist = (new Error()).stack.split('\n').slice(3);
  const s = stacklist[0];
  const sp = stackReg.exec(s) || stackReg2.exec(s);
  
  if (sp && sp.length === 5) {
    return {
      method: sp[1],
      file: sp[2],
      line: sp[3],
      pos: sp[4],
      stack: stacklist.join('\n')
    };
  }
  return null;
};

const BRANCHES_TO_CHECK = ['master', 'duet', 'cocome'];
const TEMPLATE_PATH = 'templates/.cursorignore';

/**
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  // 配置自定义的日志格式
  const customLog = (level, message, extra = {}, context = null) => {
    const fileInfo = getFileInfo();
    let logger = context && context.log ? context.log : app.log;
    
    if (fileInfo) {
      const formattedMsg = `[${fileInfo.file}:${fileInfo.line}] ${message}`;
      // 将调用栈信息合并到extra对象中，避免额外的日志记录
      if (level === 'error' || level === 'warn') {
        extra.stack = fileInfo.stack;
      }
      logger[level](formattedMsg, extra);
    } else {
      logger[level](message, extra);
    }
  };

  // 使用自定义日志
  customLog('info', "cursorignore-checker 启动了!");

  /**
   * 处理PR中的.cursorignore文件
   * @param {import('probot').Context} context Probot上下文
   * @param {string} eventType 事件类型（'opened' 或 'reopened'）
   */
  async function handlePullRequest(context, eventType) {
    const pr = context.payload.pull_request;
    const repo = context.payload.repository;
    const baseBranch = pr.base.ref;
    
    customLog('info', `处理 PR ${eventType}事件，PR #${pr.number}，目标分支: ${baseBranch}`, {}, context);
    
    // 检查目标分支是否是我们要关注的分支
    if (!BRANCHES_TO_CHECK.includes(baseBranch)) {
      customLog('info', `PR #${pr.number} 不是针对目标分支 (${BRANCHES_TO_CHECK.join('/')}), 而是 ${baseBranch}，跳过检查`, {}, context);
      return;
    }
    
    try {
      // 检查仓库中是否已存在 .cursorignore 文件
      let fileExistsInRepo = false;
      try {
        await context.octokit.repos.getContent({
          owner: repo.owner.login,
          repo: repo.name,
          path: '.cursorignore',
          ref: baseBranch
        });
        fileExistsInRepo = true;
        customLog('info', `仓库 ${repo.name} 的 ${baseBranch} 分支已包含 .cursorignore 文件，跳过处理`, {}, context);
      } catch (error) {
        // 文件不存在，继续检查 PR 中是否已添加该文件
        if (error.status !== 404) {
          throw error;
        }
      }
      
      if (fileExistsInRepo) {
        return;
      }
      
      // 检查 PR 中是否已添加 .cursorignore 文件
      let fileExistsInPR = false;
      try {
        const prFiles = await context.octokit.pulls.listFiles({
          owner: repo.owner.login,
          repo: repo.name,
          pull_number: pr.number
        });
        
        fileExistsInPR = prFiles.data.some(file => file.filename === '.cursorignore');
        
        if (fileExistsInPR) {
          customLog('info', `PR #${pr.number} 已包含 .cursorignore 文件，跳过处理`, {}, context);
          return;
        }
      } catch (error) {
        customLog('error', `检查 PR #${pr.number} 中的文件时出错: ${error.message}`, {error}, context);
        throw error;
      }
      
      // 既不在仓库中也不在 PR 中存在 .cursorignore 文件，直接添加到PR分支
      customLog('info', `PR #${pr.number} 和仓库 ${repo.name} 的 ${baseBranch} 分支均缺少 .cursorignore 文件，准备添加`, {}, context);
      
      // 获取 .cursorignore 模板内容
      const templateContent = await getTemplateContent(context);
      
      // 获取 PR 的分支名称
      const prHeadBranch = pr.head.ref;
      
      // 直接提交 .cursorignore 文件到 PR 的分支
      await context.octokit.repos.createOrUpdateFileContents({
        owner: repo.owner.login,
        repo: repo.name,
        path: '.cursorignore',
        message: `为 ${baseBranch} 分支添加 .cursorignore 文件`,
        content: Buffer.from(templateContent).toString('base64'),
        branch: prHeadBranch
      });
      
      customLog('info', `已成功为 PR #${pr.number} 添加 .cursorignore 文件`, {}, context);
      
    } catch (error) {
      customLog('error', `处理 PR #${pr.number} 时出错: ${error.message}`, {error}, context);
    }
  }

  // 监听 PR 创建事件
  app.on('pull_request.opened', async (context) => {
    await handlePullRequest(context, '创建');
  });

  // 监听 PR 重新打开事件
  app.on('pull_request.reopened', async (context) => {
    await handlePullRequest(context, '重新打开');
  });

  /**
   * 获取.cursorignore模板内容
   * @param {import('probot').Context} context Probot上下文
   * @returns {Promise<string>} 模板内容
   */
  async function getTemplateContent(context) {
    try {
      // 使用本地文件系统读取模板
      const fs = require('fs').promises;
      const path = require('path');
      const templatePath = path.join(__dirname, TEMPLATE_PATH);
      
      const content = await fs.readFile(templatePath, 'utf8');
      return content;
    } catch (error) {
      customLog('error', `获取模板内容时出错: ${error.message}`, {error}, context);
      // 如果无法获取模板，返回默认内容
      return "conf/\nbuild/\ntools/\nscripts/\ndeploy/";
    }
  }
}; 