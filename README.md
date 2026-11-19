# 个人办公室 · 宝可梦草地工作营

一个在本机运行的 AI 文档工作台：在草地营地向伙伴提交任务，由首席协调员拆解、生产官撰写、督查官审核，最后阅读并下载 Markdown 文档。

> **使用者必须自行配置自己的 DeepSeek API Key。仓库不包含 API Key，不提供共享模型额度。模型调用费用由使用者自己的 DeepSeek 账户承担。**
>
> 不配置 Key 可以打开界面、保存草稿和使用本地文件工具；真实 AI 执行会被禁用。请不要把 Key 填进代码文件、聊天记录或 GitHub。

## 功能

- 宝可梦风格的草地、树桩、二维像素伙伴和职位属性卡。
- 文档整理、会议行动清单、周报及方案撰写，支持粘贴文字材料。
- 拆解 → 撰写 → 独立审核，必要时最多一次返修与复审。
- 真实步骤进度、取消后续步骤、失败重试、刷新和断线恢复。
- 本机 SQLite 保存任务、文档和费用记录，支持 Markdown 下载。
- 团队配置、素材打包、配置更新三个独立本地工具。

当前真实执行职责为统筹、撰写和审核；情报与创意伙伴本轮待命。角色走动是视觉动画，不代表额外 AI 调用。团队文件工具不会改变当前模型执行链路。

## 本地启动

需要 **Python 3.12**、**Node.js 24**（包含 npm）和 Git。以下命令在仓库根目录运行。

### 1. 安装与构建

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend run build
```

前端没有额外 npm 运行依赖。后端当前使用 Unix 文件锁，已在 macOS 验证；Linux 可使用相同命令，Windows 请使用 WSL。

### 2. 连接你自己的 API Key

在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建自己的 API Key，确认自己的账户可用额度。

macOS 用户：在 Finder 中双击 **配置AI.command**，在打开的终端里粘贴 Key 后按回车。字符不会显示；看到“已安全保存”即配置成功。**不要在编辑器中把 Key 写进 `.command` 脚本。**

其他方式：复制 `.env.example` 为 `.env`，用本地编辑器填写：

```dotenv
MODEL_API_KEY=你的DeepSeek_API_Key
```

`.env` 已被 Git 忽略，仅由后端读取。更换或移除 Key 后，需要停止并重新启动后端服务，旧进程才会释放旧配置。

### 3. 打开工作室

macOS：双击 **启动工作室.command**，自动构建并打开浏览器。

或在终端运行：

```bash
npm --prefix frontend run build
bash scripts/start-ai.sh
```

访问 **http://127.0.0.1:8780/**。停止服务按 `Ctrl+C`。服务仅监听本机，不开放公网或局域网访问。

## 使用方法

1. 输入任务目标、交付要求和公开或已脱敏的文字材料。
2. 勾选本次材料可发送给 DeepSeek 的许可和预算说明。
3. 点击“交给伙伴 · 真实执行”。“仅保存草稿”不会调用模型。
4. 查看实际步骤进展；完成后点击“阅读文档”或下载 Markdown。

模型审核不能代替人工事实核对。取消只停止后续调度，在途模型请求可能仍计费。服务中断后可手动重试未完成步骤，已保存的步骤不重复执行。

当前仅支持最多 12000 字的文字材料；不包含 Word/PDF 上传、联网检索、图像生成或多人在线协同。

## 模型与费用

- 默认厂商、模型、费率与有效期配置位于 `config/ai.json`。
- 当前配置为 `deepseek-flash`，单任务预算上限 1 元、当前本地数据库累计预算上限 10 元。
- 费用先预留再依据 token 用量保守结算；未知用量保留预留。实际扣费以供应商账单为准。
- 费率核验有效期到 `2026-12-18`。过期会停止新调用；使用前及过期后请核对 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，再更新与实际服务匹配的配置及校验，不要仅修改日期绕过费用保护。
- 上限仅约束这个应用记录的调用，不是供应商账户的全局消费限制。重启不会重置累计预算。

## 数据与安全

任务、成果和费用账本位于 `data/ai-office.sqlite3`。仓库不包含本机任务数据库、浏览器存档、真实密钥或开发环境。输入草稿保存在当前浏览器；只有提交并确认的任务材料才进入模型调用。

备份前先停止服务，再复制数据库文件；不要删除数据库来重置预算。单份文档可在页面下载。

如需解除本项目的 AI 连接：清空本机 `.env` 中的 `MODEL_API_KEY` 并重启服务。若需要吊销密钥本身，请到自己的 DeepSeek 账户中操作。

## 工程检查

```bash
bash scripts/verify-local.sh
```

该命令核验上游文件完整性、前端语法/构建/行为测试及后端测试，使用测试替身，不产生模型费用。此前真实模型验证属于开发记录，不代表新安装者的账户已验证。

维护者如需进行真实 API 验证，必须先配置自己的 Key 并启动服务；`scripts/smoke-ai.py` 会实际调用模型并产生费用，不属于默认离线检查。

## 目录

```text
backend/       本机 API、模型调用、任务与预算持久化
frontend/      草地工作台、状态适配、样式和素材
config/        非秘密模型及预算配置
scripts/       启动、配置及验证工具
upstream/      固定版本的 solo-to-team-skills 子集及许可证
```

旧模拟工作台可使用 `bash scripts/start-demo.sh` 在 8769 端口启动；它的进度明确为模拟，原存档与真实 AI 数据分开。

本项目最初在“PRD到上线”多产品工具包内开发。部分 `docs/阶段文档/` 和阶段验证脚本记录了该环境；独立仓库日常使用不需要外部 `kit.sh`，以本 README 与 `scripts/verify-local.sh` 为准。

## 来源与素材说明

本项目的团队文件工具基于 [dabingfy-dot/solo-to-team-skills](https://github.com/dabingfy-dot/solo-to-team-skills)，上游快照、许可证和 NOTICE 保留在 `upstream/solo-to-team-skills/`。

草地背景由生成式图像工具制作。宝可梦角色图像、像素动作帧及相关标识属于第三方素材，角色素材的署名记录位于 `frontend/assets/pixel/*-credits.txt`。本项目不是宝可梦官方产品；仓库提供这些文件不代表授予第三方角色或商标的使用许可。代码与素材不能笼统视作拥有同一开源许可。
