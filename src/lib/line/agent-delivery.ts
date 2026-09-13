export interface AgentDeliveryDependencies {
  canSend: () => Promise<boolean>;
  notify: () => Promise<boolean>;
  reply: (text: string) => Promise<void>;
  remember: (text: string) => Promise<void>;
  pause: () => Promise<void>;
}

/** Notification, delivery and pause are separate outcomes. Never pause before reply. */
export async function deliverAgentReply(
  text: string, wantsHandoff: boolean, deps: AgentDeliveryDependencies,
): Promise<{ sent: boolean; notified: boolean }> {
  if (!(await deps.canSend())) return { sent: false, notified: false };
  let notified = false;
  if (wantsHandoff) {
    try { notified = await deps.notify(); } catch { /* Retain a truthful failure reply. */ }
    text = notified
      ? "มิมิแจ้งเรื่องให้ทีมแอดมินแล้วค่ะ จะพักการตอบเพื่อให้ทีมเข้ามาดูแลต่อนะคะ"
      : "มิมิยังส่งแจ้งเตือนให้ทีมแอดมินไม่สำเร็จค่ะ สามารถติดต่อทีมผ่านหน้าแจ้งปัญหา https://storebymari.com/support/report ได้ ระหว่างนี้มิมิยังช่วยแนะนำต่อได้ค่ะ";
  }
  if (!(await deps.canSend())) return { sent: false, notified };
  await deps.reply(text);
  // If delivery throws, do not record a nonexistent answer or silence the customer.
  if (notified) await deps.pause();
  await deps.remember(text);
  return { sent: true, notified };
}
