# dsh-superpowers

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）打包的
[Superpowers](https://github.com/obra/superpowers)：Jesse Vincent 的智能体工程方法论技能库
（头脑风暴、编写计划、测试驱动开发、系统化调试、完成前验证、代码评审），以单个 DSH 插件包（bundle）交付。

| | |
|---|---|
| 上游 | `obra/superpowers` **v6.4.2**，提交 `8ca22dba`（[pin](upstream/pin.json)） |
| 技能 | 全部 15 个技能，上游 `skills/` 下的 74 个文件，每个文件都经过 git blob 哈希校验；其中 73 个与上游逐字节一致 |
| 已测试 | DeepSeek Harness Desktop `0.2.0-rc.2`，Windows 11 |

## 包含什么

该插件包向 DSH profile 添加三行插件，每一行都可以单独开关：

| 行 | 默认 | 作用 |
|---|---|---|
| `dsh-superpowers-skills` | 开 | 在所有工作区的每个会话中提供技能。 |
| `dsh-superpowers-bootstrap` | 开 | 把上游的会话启动文本（包裹 `using-superpowers`），连同 DSH 工具映射，放进每个会话的系统提示词，替代 DSH 没有的 `SessionStart` 钩子。子智能体（`delegationDepth > 0`）不注入，与上游一致。 |
| `dsh-superpowers-gate` | **关** | 可选的强制机制：会话加载技能之前，拒绝对源文件的 `write`/`edit`。**并非**上游的一部分。 |

与上游的差异刻意保持最小。上游的
[移植指南](https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md)
要求永远不要为适配某个 harness 而修改技能正文，本移植遵循这一点：

- **技能原样交付：** 唯一的例外，是在 `using-superpowers` 的 “Platform Adaptation” 列表中加了一行指向 DSH 映射的说明，这也是指南唯一允许的改动。
- **一个 DSH 专用文件：** [`using-superpowers/references/dsh-tools.md`](skills/using-superpowers/references/dsh-tools.md)，把技能里的动作映射到 DSH 工具。它说明 `superpowers:<name>` 要按 `<name>` 加载、子智能体只有一层，以及如何在 Windows 上运行 bash 辅助脚本。引导文本会内联这份映射，因此每个会话都能看到。
- **改动记录：** 每处改动都是 [`overlays/`](overlays/) 中可审阅的文件；`skills/` 中没有任何手工维护的内容。

## 安装

在 DSH Desktop 的 **插件（Plugins）** 页面选择安装，输入：

```
github:blugart-dev/dsh-superpowers#v1.0.0-rc.1
```

也可以在 Creator 模式下让智能体执行：
`plugin_manager { action: install_bundle, spec: "github:blugart-dev/dsh-superpowers#v1.0.0-rc.1" }`。

仓库目前为私有，安装时需要有读取权限的 git（SSH）凭据；没有权限时，可先克隆，再从本地路径安装。

**安装或更新后请重启 DSH**：替换已安装的包需要加载新的模块代。

### 验证是否生效

在任意工作区新建会话并发送一条消息，然后在本仓库的克隆中运行：

```
npm run inspect-session
```

它读取 DSH 自己的会话日志，期望看到 `Bootstrap  present once in the system prompt`。
详见 [docs/VERIFYING.md](docs/VERIFYING.md)（英文）。

## 配置

可在插件页面开关各行，或执行：

```
plugin_manager { action: set_plugin, target: dsh-superpowers-bootstrap, enabled: false }
```

**开启门禁：** 启用 `dsh-superpowers-gate` 行，并在 profile 补丁中以 `gate: true` 覆盖其 `config`。
覆盖会整体替换 `config` 块，因此请写全所需字段。`requiredSkills` 可限定哪些技能能解除门禁，
例如 `[test-driven-development, systematic-debugging]`；默认空列表表示任何技能都可以。
门禁自带的恢复技能 `superpowers-workflow` 始终能解除门禁，因此会话不会被锁死。

门禁的局限：它看不到 shell 写入；它只在拒绝消息中给出恢复技能的名称，不会提前宣传。

技能名称冲突、子智能体与诊断日志（`diagnosticsLog`）等细节，请参阅 [README.md](README.md)。

## 卸载

在插件页面移除该插件包，或执行
`plugin_manager { action: remove_bundle, target: "@blugart-dev/dsh-superpowers" }`，然后重启 DSH。

## 开发

需要 Node ≥ 23.6 和 git：

```
npm run verify        # sync:check + 契约检查 + 单元测试
npm run compat        # 检查插件包能否在已安装的 DSH 上正确组合（不调用模型）
npm run eval:harness  # 用真实的无头 DSH 会话做行为测试（会消耗 API token）
```

参见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（英文）。

## 许可

MIT。技能源自 obra/superpowers，Copyright (c) 2025 Jesse Vincent，遵循 [LICENSE.superpowers](LICENSE.superpowers)
中的 MIT 许可；本包的许可见 [LICENSE](LICENSE)。
