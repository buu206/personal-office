# 更新我的团队 · 三份配置，另存一份

双击[更新我的团队.html](index.html)。选择最初采用的母版、你现在的队伍，以及准备参考的新版。三份文件都应来自原建队台，格式为 `solo-to-team.definition`，并使用同一个团队 ID。核清新版来自哪里，再决定采用哪些内容。

本页只比较内容；团队ID相同不能证明三份文件有共同母版。请确认母版来源。

1. 点“比较三份文件”。每一行都显示该字段在三个版本中的值和稳定 ID。只有自己改过的内容直接保留。双方已改成相同值的内容也会保留。
2. 候选新版与本地不同的项目需要逐项选择。选“采用候选新版”只取本行展示的字段。如候选新建或删除了整席/整群，该行的决定适用于整个对象。双方各建了同名 ID、内容却不同，也须先选一份完整对象。共同现有对象的顺序可单独处理，新采纳的对象按新版顺序追加到本地队列。
3. 全部选择完成后，用同版建队台校验器复查。如果制作和独审指向同一席、群成员或阶段负责人已不存在、合并后名称重复，页面会标明冲突所在的 ID。调整相关选择，或在原建队台编辑相关文件后重新载入。原有三份文件一直保留。
4. 下载新文件，在[当前16席建队台](../team-16/index.html)点“打开配置”检查。每个输出名都带内容指纹；JSON 保持同一中性配置格式，职责和群用途保留原文缩进与换行。本页不安装到任何宿主，不修改账号权限、实时群或正在运行的团队。

**用随包纸船工坊样例试一次。** 依次选 [01 原母版](examples/01-base.team.json)、[02 我的队伍](examples/02-mine.team.json)、[03 候选新版](examples/03-next.team.json)。岗位 `maker` 的名字和头像是自己改的，`handoff` 的群籍也按自己的做法调整过。对职责冲突明确选择新版，再选择是否纳入“印样校对”和“打样桌”。如接纳新群却不接纳它所依赖的岗位，页面会告诉你缺的是谁。[查看实际点选后导出的结果](examples/04-updated.team.json)。该文件已在原编队台界面复开核对。

**范围。** 每份最多 32 MiB、200 个角色及 200 个群。只处理这个中性格式已有的结构、职责、群用途、群成员、头像和四项交接。独立手册文件或宿主专有的管理员、模型与权限设置另由原渠道管理。单独写在职责或群用途里的文字，在该字段上作整体三方比对，不自动拼接或推断权限。

## English

Open [the local updater](index.html#en). Select the original definition you used, your own customized version, and the candidate you want to compare. They must have the same team ID and use the `solo-to-team.definition` format. Check the source of your upstream file.

This page compares content. Matching team IDs do not verify a shared history. Check the original base yourself.

Click **Compare files**. The page shows the base, local and upstream values for each changed field. Local-only edits and matching changes are retained. Choose **Keep mine** or **Use upstream candidate** for each remaining change. A whole-role/group addition or deletion displays the complete object; field-level changes affect that field alone. A same-ID addition with different content requires an explicit whole-object choice. New items are appended in candidate order.

The final check blocks a shared producer/reviewer, missing members, missing workflow owners and duplicate names. Adjust your choices or fix and reload the source definitions. Open the new file in the [current 16-role builder](../team-16/index.html#en). It retains the neutral definition format and preserves indentation and line breaks in duties and group descriptions. This local operation does not update any host account, native room or live permissions. Separate handbooks and host-specific configuration are outside the neutral definition. Files are processed in memory, without network requests or persistent browser storage.
