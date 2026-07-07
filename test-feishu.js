const https = require('https');

const WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/8781a14e-9428-46d6-9771-0b50b722b065';

function send(msg) {
  const data = JSON.stringify({ msg_type: 'text', content: { text: msg } });
  const u = new URL(WEBHOOK);
  const req = https.request({
    hostname: u.hostname, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) },
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => console.log('状态:', res.statusCode, body));
  });
  req.write(data);
  req.end();
}

send('✅ 排班日历连通性测试\n如果你看到这条消息，说明飞书机器人配置正确！');
