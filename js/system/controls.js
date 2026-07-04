import { store } from '../state/store.js';

import { createLogger } from '../utils/logger.js';
const _log = createLogger('CONTROLS');

export async function changeSystemVolume(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const scalar = (pct / 100).toFixed(2);

  async function tryMethod1() {
    return await window.electronAPI.runPowerShell(`
      $ErrorActionPreference = 'Stop';
      try {
        $code = '
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume { int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out uint c); int SetMasterVolumeLevelScalar(float l, ref Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l); }
        [Guid("7991E194-C085-40E5-882D-2450202D303D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int m, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
        [Guid("D66606E7-2774-40F5-857A-CE354C1474C5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref Guid id, int cls, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
        public class Vol { public static void Set(float v) {
          var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom()); IMMDevice d = null; e.GetDefaultAudioEndpoint(0, 0, out d);
          object o = null; var g = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
          d.Activate(ref g, 23, IntPtr.Zero, out o); ((IAudioEndpointVolume)o).SetMasterVolumeLevelScalar(v, ref g);
        } }';
        Add-Type -TypeDefinition $code; [Vol]::Set(${scalar});
        Write-Output "Volumen establecido al ${pct}%";
      } catch { throw $_; }
    `);
  }

  async function tryMethod2() {
    return await window.electronAPI.runPowerShell(`
      $ErrorActionPreference = 'Stop';
      try {
        $obj = New-Object -ComObject WScript.Shell;
        for ($i = 0; $i -lt 100; $i++) { $obj.SendKeys([char]174) };
        for ($i = 0; $i -lt ${pct}; $i++) { $obj.SendKeys([char]175) };
        Write-Output "Volumen establecido al ${pct}% (método teclado)";
      } catch { throw $_; }
    `);
  }

  try {
    const slider = document.getElementById('vol-slider');
    const valLabel = document.getElementById('vol-value');
    if (slider) slider.value = pct;
    if (valLabel) valLabel.innerText = `${pct}%`;
  } catch (e) {}

  let r = await tryMethod1();
  if (!r.success) {
    _log('warn', `Volume method 1 failed: ${r.output}`);
    r = await tryMethod2();
  }
  if (!r.success) _log('error', `Volume failed: ${r.output}`);
  else store.set('lastVolume', pct);
  return r;
}

export async function changeSystemBrightness(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  async function tryMethod1() {
    return await window.electronAPI.runPowerShell(`
      $ErrorActionPreference = 'Stop';
      try {
        $monitors = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods;
        if ($monitors) { foreach ($m in $monitors) { $m.WmiSetBrightness(0, ${pct}) }; Write-Output "Brillo establecido al ${pct}%"; }
        else { throw "No se encontró monitor WMI"; }
      } catch { throw $_; }
    `);
  }

  async function tryMethod2() {
    return await window.electronAPI.runPowerShell(`
      $ErrorActionPreference = 'Stop';
      try {
        $monitors = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods;
        if ($monitors) { foreach ($m in $monitors) { $m.WmiSetBrightness(0, ${pct}) }; Write-Output "Brillo establecido al ${pct}%"; }
        else { throw "No se encontró monitor WMI (método 2)"; }
      } catch { throw $_; }
    `);
  }

  let r = await tryMethod1();
  if (!r.success) { _log('warn', `Brightness method 1 failed: ${r.output}`); r = await tryMethod2(); }
  if (!r.success) _log('error', `Brightness failed: ${r.output}`);
  return r;
}
