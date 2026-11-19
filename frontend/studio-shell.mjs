export function studioShell(source){
 let html=source;
 const replace=(a,b)=>{if(!html.includes(a))throw Error('Studio shell source changed: '+a.slice(0,45));html=html.replace(a,b);};
 replace('href="trainer.css"','href="trainer.css"><link rel="stylesheet" href="studio.css"');
 replace('src="app.mjs"','src="studio.mjs"');
 replace('本机模拟演示。','本机AI文档工作室。');
 replace('<i></i>模拟演示','<i></i><span id="connection-state">连接中</span>');
 replace('仅本机保存','成果保存在本机');
 replace('当前项目进度','已完成步骤');
 replace('<small>%</small>','<small id="gauge-total">/ 3</small>');
 replace('项目总数','本页委托');replace('已完成</span></div></div>','已交付</span></div></div>');
 replace('进行中的冒险','我的委托');
 replace('<div id="project-list" class="project-list"></div>','<div id="project-list" class="project-list"><p>正在读取委托…</p></div><div class="list-pages"><button id="list-prev">上一页</button><span id="list-page">1</span><button id="list-next">下一页</button></div>');
 replace('<button id="export-main"><span>↓</span> 导出工作台存档</button><p>项目、草稿与进度保存在此浏览器。定期导出，换设备也能继续。</p>','<button id="refresh-tasks">重新连接 / 刷新</button><p>任务与成果自动保存在本机。这里显示真实步骤；伙伴走动是场景动画。</p><p id="budget-status">正在读取预算…</p>');
 replace('等待本地存档','正在连接本机服务');
 replace('本地模拟 · 无真实 AI 调用','DeepSeek · 真实文档协作');
 replace('点击伙伴或卡片，查看它负责的工作','点击伙伴查看分工 · 本轮启用统筹、撰写、审核');
 replace('<span>选择卡片，查看分工</span>','<span>研究与创意伙伴本轮待命</span>');
 replace('<p id="task-help">写下目标，让伙伴们开始一次协作演示。</p><button type="submit" class="primary" id="start-button"><span aria-hidden="true">▷</span> 出发！ <kbd id="run-shortcut">Ctrl ↵</kbd></button>',`<label class="real-label" for="criteria-input">交付要求</label><textarea id="criteria-input" rows="2" maxlength="1500" placeholder="例如：列出事项、负责人和期限；缺少的信息写待确认" required></textarea>
<label class="real-label" for="material-input">本次材料 <span>仅公开 / 已脱敏文字</span></label><textarea id="material-input" rows="5" maxlength="12000" placeholder="粘贴需要整理的文字，最多12000字"></textarea>
<label class="consent"><input id="material-consent" type="checkbox">我确认本次材料可发送给 DeepSeek；单任务最多1元，累计测试最多10元。</label>
<p id="task-help">真实生成文档，成果保存在本机。请核对后使用。</p><button type="submit" class="primary" id="start-button" disabled>交给伙伴 · 真实执行 <kbd id="run-shortcut">Ctrl ↵</kbd></button><button type="button" id="save-draft" class="draft-button">仅保存草稿 · 不调用模型</button>`);
 replace('所选节点的模拟状态','所选节点的真实状态');replace('模拟运行记录','真实运行记录');
 replace('<button class="text-button" id="pause-button" disabled>暂停</button>','<button class="text-button" id="cancel-task" disabled>取消后续步骤</button>');
 replace('<div id="result-card" class="result-card" hidden><strong>运行记录已就绪</strong><button id="export-result">下载本次模拟记录 ↓</button></div>',`<div class="task-actions"><button id="resume-task" hidden>开始此草稿</button><button id="retry-task" hidden>重试失败步骤</button></div><p id="task-message" role="status"></p><div id="result-card" class="result-card" hidden><strong id="artifact-label">文档已生成</strong><p id="review-summary"></p><button id="read-document">阅读文档</button><a id="artifact-download" class="download-link">下载 Markdown ↓</a><p class="muted">模型审核不代替人工核对。</p></div>`);
 const start=html.indexOf('  <dialog id="settings-dialog">'),end=html.indexOf('  <script src="team-core.js">');
 if(start<0||end<start)throw Error('Missing settings region');
 html=html.slice(0,start)+`<dialog id="settings-dialog"><div class="dialog-heading"><h2>工作室说明</h2><button class="icon-button" id="settings-close" aria-label="关闭设置">×</button></div><p>文档任务由首席协调员、生产官和督查官依次执行。团队配置工具用于独立团队文件，不会更改这条执行链路。</p><p>任务、成果及费用账本保存在本机数据库。更换密钥请在 Finder 中双击配置AI.command，然后重启工作室。</p><p>单任务最多1元，累计测试最多10元；取消不会撤回已发出的模型请求。研究、创意伙伴本轮未参与真实执行。</p><p>旧演示存档仍保留在原浏览器与端口。</p><a href="http://127.0.0.1:8769/" target="_blank" rel="noopener">打开旧演示（需启动Demo）</a></dialog>
<dialog id="document-dialog"><div class="dialog-heading"><h2 id="document-title">交付文档</h2><button id="document-close" class="icon-button" aria-label="关闭文档">×</button></div><p id="document-status"></p><pre id="document-body" class="document-body"></pre><a id="document-download" class="download-link">下载这份 Markdown</a></dialog>\n`+html.slice(end);
 return html;
}
