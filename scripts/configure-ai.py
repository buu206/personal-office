"""Write this product's key with hidden terminal input; never print it."""
import getpass
import os
import re
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if not sys.stdin.isatty():
    sys.exit('请在终端双击配置AI.command，密钥使用隐藏输入。')
print('配置个人办公室的 DeepSeek API Key。输入不显示字符；不会发起收费调用。')
key = getpass.getpass('粘贴 API Key 后按回车：').strip()
if not re.fullmatch(r'[A-Za-z0-9_-]{16,256}', key):
    sys.exit('密钥格式不正确；没有写入。')
path = root / '.env'
if path.is_symlink():
    sys.exit('配置路径不能是符号链接。')
lines = path.read_text().splitlines() if path.exists() else []
lines = [line for line in lines if not line.startswith('MODEL_API_KEY=')]
lines.append('MODEL_API_KEY=' + key)
fd, tmp = tempfile.mkstemp(prefix='.env.', dir=root)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write('\n'.join(lines) + '\n')
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
print('已安全保存到本产品本地配置。重新启动AI服务后生效。请回到对话告诉我“已配置”。')
input('按回车关闭。')
