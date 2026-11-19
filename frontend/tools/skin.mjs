import {enhancePackFeedback} from './pack-feedback.mjs';
import {createHash} from 'node:crypto';

const pages = [
  ['team-16','团队配置'],
  ['start-with-files','素材打包'],
  ['update-team','配置更新'],
];

export function skinTool(html, name, css) {
  if(name==='start-with-files')html=enhancePackFeedback(html);
  const style = '\n' + css + '\n';
  const hash = createHash('sha256').update(style).digest('base64');
  if (!html.includes("style-src ") || !html.includes('</head>') || !html.includes('<body>')) {
    throw Error('工具页面结构变化，无法应用已验证的样式');
  }
  const navigation = '<nav class="camp-nav" aria-label="工作台导航">' +
    '<a class="camp-home" href="../../index.html"><span class="camp-ball" aria-hidden="true"></span>草地工作营</a>' +
    pages.map(([id,label]) => '<a href="../'+id+'/index.html"'+(name===id?' aria-current="page"':'')+'>'+label+'</a>').join('') +
    '</nav>';
  return html.replace(/style-src ([^;"]+)/, (_,sources) => "style-src " + sources + " 'sha256-" + hash + "'")
    .replace('</head>', '<style>'+style+'</style></head>')
    .replace('<body>', '<body>'+navigation);
}
