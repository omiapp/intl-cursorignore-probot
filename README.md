# Cursorignore Checker Probot

这是一个GitHub Probot应用，用于监控组织中新创建的仓库，自动检查其master/duet/cocome分支是否包含`.cursorignore`文件。如果不存在，应用会自动创建PR提交该文件。

## 功能特点

- 监控组织内新创建的仓库
- 仅检查以`intl-`开头的仓库
- 自动检查master、duet和cocome分支
- 如分支存在但缺少`.cursorignore`文件，则创建PR
- 使用`templates/.cursorignore`作为模板文件

## 使用方法

1. 安装依赖: `npm install`

2. 注册GitHub App
   - 设置必要的权限：`Repository contents`、`Pull requests`、`Repository metadata`
   - 订阅事件: `Repository`

3. 配置环境变量: 复制`.env.example`为`.env`并填写必要信息

4. 启动应用: `npm start`

## 部署方式

应用可以部署到任何支持Node.js的平台，如Heroku、Vercel、AWS等。确保设置正确的环境变量。

## 维护

- 确保`templates/.cursorignore`文件内容保持最新
- 监控应用日志，确保正常运行

## 开发

```sh
# 运行测试
npm test
```

## 许可证

MIT