export function observeOrderSubscription(
  socket,
  orderId,
  { timeoutMs = 5000, subscriptions = [], errors = [], attempts = [] } = {},
) {
  let stopped = false;
  const onConnect = async () => {
    const socketId = socket.id;
    const attempt = { socketId, startedAt: Date.now() };
    attempts.push(attempt);
    try {
      const ack = await socket
        .timeout(timeoutMs)
        .emitWithAck("order.subscribe", { orderId });
      attempt.finishedAt = Date.now();
      attempt.outcome = ack.ok ? "acknowledged" : "denied";
      if (stopped) return;
      if (!ack.ok) errors.push("subscription denied");
      else
        subscriptions.push({
          socketId,
          at: Date.now(),
          version: ack.currentVersion,
        });
    } catch (error) {
      attempt.finishedAt = Date.now();
      attempt.error = error.message;
      const currentConnection =
        !stopped && socket.connected && socket.id === socketId;
      attempt.outcome = stopped
        ? "cleanup"
        : currentConnection
          ? "connected-ack-failure"
          : "disconnected";
      if (currentConnection)
        errors.push("subscription acknowledgement failed while connected");
    }
  };
  socket.on("connect", onConnect);
  return {
    attempts,
    subscriptions,
    errors,
    isFresh: () =>
      socket.connected && subscriptions.some((s) => s.socketId === socket.id),
    stop: () => {
      stopped = true;
      socket.off("connect", onConnect);
    },
  };
}
