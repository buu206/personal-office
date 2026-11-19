# 一人成阵 · Solo to Team

> **新增：按平台取完整包。** 每包含平台Skill及四款完整基础Skills。[选择平台下载](../README.md#选你正在使用的平台)。下方完整MAS组合与原工具继续保留。

> **当前完整候选：** [三端rc5＋Grok design2-doc1/adapter.5](<releases/rc15-skills-rc5-grok-design2-doc1-adapter5/README.zh.md>)。原MAS与原四款Skill保留，采用方法与有限验证范围见链接。没有统一一键安装整队的承诺。

[English](README.en.md) · [下载当前完整使用包](releases/rc15-skills-rc5-grok-design2-doc1-adapter5/Solo-to-Team-MAS-rc15-skills-rc5-grok-design2-doc1-adapter5-candidate.zip)

把做了一半的项目交给一支 AI 团队。**首席接单，生产官制件，审核官打开成品检查。** 中途改条件，团队修订受影响的地方，把通过审核的版本交回原对话。首发模板包含 **16 席、6 个建议群、26 条建议入群关系**。你可以按任务选用岗位，也可以在本机改岗位、群和交接方式。第一单仍可先用首席、生产、审核这三席。

![真实页面演示。交接表原先把已经领用的备用材料记成短缺，修订后两版结果可以对照。随后在本机改首席名称、新增物资接收员并导出四席项目。](media/team-in-action.zh-CN.gif)

**一套备品究竟去了哪里？** 实际的 WorkBuddy 合成题允许第二轮领用一套备品。演示选择第二桌来说明怎样登记。初稿却写死了散场时应交回 1 套。审核官退回后，修订版把“已领用”的应交数改为 0，并要求记下桌号和时间。没有领用时，两版都应交 1 套。[查看原表摘录和审核依据](evidence/handoff.md) · [播放 25 秒演示](media/solo-to-team-demo.zh-CN.mp4) · [中文时间字幕](media/solo-to-team-demo.zh-CN.vtt)

[查看16席六群编队说明](showcase/README.md)。展示头像只供我们自己使用，不对外授权；下载工具包使用岗位示意图。

## 在自己的电脑上跑第一单

1. [下载当前完整ZIP](releases/rc15-skills-rc5-grok-design2-doc1-adapter5/Solo-to-Team-MAS-rc15-skills-rc5-grok-design2-doc1-adapter5-candidate.zip)，解压到新的空目录，打开 **Solo-to-Team → START-MAS-PLUS-SKILLS.html**。选已有平台并按对应说明采用。
2. 选已有可用模型的平台。在首页打开**16 席团队配置**，按需要选岗位、改分工并保存自己的团队文件。再按该平台入口导出，核实本机目录与权限；导出文件本身不会在账号里建助手。
3. 把[20 人活动底稿](evidence/01-intake.md)单独给首席。等首席确认 **MAP-20-R1**，在同一对话发[24 人变更](evidence/02-change.md)。收件时打开执行包和独立审核记录，核对版本，并看散场时应由谁点收、向谁交班。

| 平台 | 第一步 | 团队观察范围 |
| --- | --- | --- |
| Grok Bot | 打开自助首单包，核已有席，只建缺席。 | 据本机项目记录，测试者以试用者视角读已知题，指出一个交接问题。现役团队随后修订、复核并回件。 |
| OpenMausBot | 在 0.1.148 的「模板 → 导入」预览部门文件。 | 自定义四席已在隔离的原生数据层导入；首单实跑使用手动建好的三席。 |
| WorkBuddy | 在首页打开安装说明，按本机条件选创建器或 Mac 私有登记。 | 本机私有三席实跑，生产席定向退修，审核席复核 R2。 |
| DeepSeek Harness | 在 0.2.1-rc.5 选择包内工作区，在新根会话用 `/solo-to-team`。 | 本机标准三席和建队器导出的自定义四席均有实际任务留件。 |

上表是此前三席或四席任务的证据，不等于完整 16 席已在四个平台全部跑通。当前新增模板的逐端结果另按真实导入与实际回件记录。

四个平台的过程描述来自团队本机观察及留件，未取得平台端运行日志。OpenMausBot 和 WorkBuddy 的过程属团队自述，读者可复算原表摘录。普通新用户独立装队的成功率尚未测量。所列项目自制材料已采用 MIT，允许商用，范围与例外见 [NOTICE](../NOTICE)；本版为发布候选。

新增16席候选已完成本机OpenMaus原生导入与回导、顾问团审核助理链，以及DeepSeek Harness两子会话的变更与局部退修。各项范围、审批模式和附件限制见[本轮16席验证记录](release/current/overlay/team-16/VERIFICATION.zh.md)。

[先拿小练习，双击即可验一单](downloads/quick-review.zip) · [取得当前完整维护源码](releases/rc15-skills-rc5-grok-design2-doc1-adapter5/MAS-rc15-three-rc5-grok-design2-doc1-adapter5-maintainer-source.zip)

维护者解压当前完整维护源码，按其中`mas-combined-source/开始重建.md`执行；已核得到同字节完整使用包。[历史底座源码说明](release/CURRENT.md)保留旧版本范围，不用旧构建命令重建当前组合。

[Grok完整输入续测：已核范围与未证边界](evidence/grok-complete-input-r2.md)。

[本次反馈修订与剩余验证](evidence/feedback-revision-doc1.md)。
