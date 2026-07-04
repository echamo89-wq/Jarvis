export async function runCmd(command) {
  return await window.electronAPI.runCmd(command);
}
