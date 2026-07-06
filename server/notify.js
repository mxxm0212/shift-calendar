const axios = require('axios');
const { getConfig, updatePlan } = require('./db');

/**
 * Send a Feishu (Lark) bot notification for a plan reminder.
 * @param {object} plan - The plan object
 * @returns {boolean} - Whether the notification was sent successfully
 */
async function sendFeishuNotification(plan) {
  const webhookUrl = getConfig('feishu_webhook_url');
  if (!webhookUrl) {
    console.log('[Notify] No Feishu webhook URL configured, skipping notification');
    return false;
  }

  const deadlineDate = new Date(plan.deadline);
  const now = new Date();
  const minutesLeft = Math.round((deadlineDate.getTime() - now.getTime()) / 60000);

  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: {
          tag: 'plain_text',
          content: '⏰ 计划提醒',
        },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${plan.title}**\n\n${plan.description || '暂无描述'}`,
          },
        },
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `📅 截止时间：**${deadlineDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}**\n⏳ 剩余时间：**约 ${minutesLeft} 分钟**`,
          },
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '来自排班日历助手',
            },
          ],
        },
      ],
    },
  };

  try {
    await axios.post(webhookUrl, card, { timeout: 10000 });
    console.log(`[Notify] Sent notification for plan "${plan.title}"`);
    return true;
  } catch (err) {
    console.error(`[Notify] Failed to send notification for plan "${plan.title}":`, err.message);
    return false;
  }
}

/**
 * Check all plans and send notifications for ones that need it.
 */
async function checkAndNotify() {
  const { getPlansNeedingNotification } = require('./db');
  const plans = getPlansNeedingNotification();

  for (const plan of plans) {
    const sent = await sendFeishuNotification(plan);
    if (sent) {
      updatePlan(plan.id, { notified: 1 });
    }
  }
}

module.exports = { sendFeishuNotification, checkAndNotify };
