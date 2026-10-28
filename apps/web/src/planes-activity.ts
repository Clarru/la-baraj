/** UI intention consumed by the existing seated animation state machine. */
let leaveRequested = false;
export function requestTableStand() {
  leaveRequested = true;
}
export function takeTableStandRequest() {
  const requested = leaveRequested;
  leaveRequested = false;
  return requested;
}
