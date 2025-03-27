# intl-template

这是一个模板仓库，用于为所有以 `intl-` 开头的仓库提供标准化配置和检查。

## 功能

本仓库包含以下主要功能：

1. **模板文件自动添加**：当新建以 `intl-` 开头的仓库时，会自动创建 PR 添加必要的模板文件。

2. **.cursorignore 文件强制检查**：对于 master、duet 和 cocome 分支，检查仓库中是否已存在 `.cursorignore` 文件。如果仓库中尚未包含该文件，则 PR 必须添加此文件才能合并。这确保了 Cursor AI 正确忽略不需要被处理的文件和目录。

## 如何使用

### .cursorignore 文件

在您的仓库中创建一个名为 `.cursorignore` 的文件，该文件指定 Cursor 应该忽略的文件和目录。您可以参考 `templates/.cursorignore` 文件作为模板。

### 注意事项

- 所有 master、duet 或 cocome 分支必须包含 .cursorignore 文件
- 如果仓库中尚未包含该文件，PR 必须添加此文件才能合并
- 模板文件会在新仓库创建时自动添加