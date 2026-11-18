# Codexter dictation on Windows: records the default microphone (winmm waveIn through the wave mapper, which converts to the
# wanted format) as 16-bit mono PCM at 24 kHz and writes one base64 line per 100 ms to stdout. The first line is READY.
# A line "stop" on stdin (or stdin closing) ends it after the audio recorded so far has been written. Nothing is saved to disk.
# Errors: one line "ERR <code> <text>" on stderr, exit code 2.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class CodexterMic {
  [StructLayout(LayoutKind.Sequential)]
  struct WaveFormat { public ushort Tag, Channels; public uint SamplesPerSec, AvgBytesPerSec; public ushort BlockAlign, BitsPerSample, Size; }
  [StructLayout(LayoutKind.Sequential)]
  struct WaveHdr { public IntPtr Data; public uint BufferLength, BytesRecorded; public IntPtr User; public uint Flags, Loops; public IntPtr Next, Reserved; }

  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, uint device, ref WaveFormat f, IntPtr cb, IntPtr inst, uint flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInClose(IntPtr h);

  const uint WAVE_MAPPER = 0xFFFFFFFF;
  const uint WHDR_DONE = 1;
  const int RATE = 24000, BUFFERS = 6, BYTES = RATE / 10 * 2;   // 100 ms of 16-bit mono
  static volatile bool stop;

  static void Line(Stream o, string s) { byte[] b = Encoding.ASCII.GetBytes(s + "\n"); o.Write(b, 0, b.Length); o.Flush(); }

  public static int Run() {
    Stream stdout = Console.OpenStandardOutput();
    WaveFormat f = new WaveFormat { Tag = 1, Channels = 1, SamplesPerSec = RATE, AvgBytesPerSec = RATE * 2, BlockAlign = 2, BitsPerSample = 16, Size = 0 };
    IntPtr h;
    int r = waveInOpen(out h, WAVE_MAPPER, ref f, IntPtr.Zero, IntPtr.Zero, 0);
    if (r != 0) {
      string why = r == 2 ? "no microphone found" : r == 4 ? "the microphone is in use" : r == 32 ? "the microphone does not support the format" : "the microphone could not be opened";
      Console.Error.WriteLine("ERR " + r + " " + why); return 2;
    }
    int hs = Marshal.SizeOf(typeof(WaveHdr));
    IntPtr[] hdrs = new IntPtr[BUFFERS];
    for (int i = 0; i < BUFFERS; i++) {
      WaveHdr w = new WaveHdr { Data = Marshal.AllocHGlobal(BYTES), BufferLength = BYTES };
      hdrs[i] = Marshal.AllocHGlobal(hs);
      Marshal.StructureToPtr(w, hdrs[i], false);
      waveInPrepareHeader(h, hdrs[i], hs);
      waveInAddBuffer(h, hdrs[i], hs);
    }
    new Thread(() => { try { string l; while ((l = Console.In.ReadLine()) != null) if (l.Trim() == "stop") break; } catch { } stop = true; }) { IsBackground = true }.Start();
    r = waveInStart(h);
    if (r != 0) { Console.Error.WriteLine("ERR " + r + " the microphone could not be started"); return 2; }
    Line(stdout, "READY");
    int next = 0;
    byte[] buf = new byte[BYTES];
    bool resetDone = false;
    while (true) {
      WaveHdr w = (WaveHdr)Marshal.PtrToStructure(hdrs[next], typeof(WaveHdr));
      if ((w.Flags & WHDR_DONE) == 0) {
        if (stop && !resetDone) { waveInReset(h); resetDone = true; continue; }   // hands back the buffers, the partly filled one too
        if (resetDone) break;
        Thread.Sleep(10);
        continue;
      }
      int n = (int)w.BytesRecorded;
      if (n > 0) { Marshal.Copy(w.Data, buf, 0, n); Line(stdout, Convert.ToBase64String(buf, 0, n)); }
      if (resetDone) {
        // after the reset every buffer comes back done once: write them in order, then stop
        w.Flags &= ~WHDR_DONE; w.BytesRecorded = 0; Marshal.StructureToPtr(w, hdrs[next], false);
        next = (next + 1) % BUFFERS;
        continue;
      }
      w.Flags &= ~WHDR_DONE; w.BytesRecorded = 0; Marshal.StructureToPtr(w, hdrs[next], false);
      waveInAddBuffer(h, hdrs[next], hs);
      next = (next + 1) % BUFFERS;
    }
    for (int i = 0; i < BUFFERS; i++) waveInUnprepareHeader(h, hdrs[i], hs);
    waveInClose(h);
    Line(stdout, "END");
    return 0;
  }
}
'@
exit [CodexterMic]::Run()
