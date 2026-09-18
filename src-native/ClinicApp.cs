using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace ClinicDesktop
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string distDir = Path.Combine(baseDir, "dist");
            if (!Directory.Exists(distDir))
            {
                MessageBox.Show(
                    "لم يتم العثور على ملفات النظام (مجلد dist).\nيرجى التأكد من وجود ملفات البرنامج في نفس المجلد.",
                    "تنبيه - برنامج إدارة العيادة",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            // Find a free loopback port
            int port = 28443;
            HttpListener listener = null;
            for (int p = 28443; p < 28550; p++)
            {
                try
                {
                    listener = new HttpListener();
                    listener.Prefixes.Add("http://127.0.0.1:" + p + "/");
                    listener.Start();
                    port = p;
                    break;
                }
                catch
                {
                    if (listener != null) listener.Close();
                    listener = null;
                }
            }

            if (listener == null)
            {
                MessageBox.Show(
                    "تعذر تشغيل الملقم الداخلي للبرنامج.",
                    "خطأ",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // Start internal server thread
            Thread serverThread = new Thread(() =>
            {
                try
                {
                    while (listener.IsListening)
                    {
                        HttpListenerContext ctx = listener.GetContext();
                        ThreadPool.QueueUserWorkItem((state) =>
                        {
                            try
                            {
                                string urlPath = ctx.Request.Url.AbsolutePath.TrimStart('/');
                                if (string.IsNullOrEmpty(urlPath)) urlPath = "index.html";
                                string filePath = Path.Combine(distDir, urlPath.Replace('/', Path.DirectorySeparatorChar));

                                if (!File.Exists(filePath))
                                {
                                    // Fallback for single page routing
                                    filePath = Path.Combine(distDir, "index.html");
                                }

                                byte[] buffer = File.ReadAllBytes(filePath);
                                string ext = Path.GetExtension(filePath).ToLowerInvariant();
                                if (ext == ".html") ctx.Response.ContentType = "text/html; charset=utf-8";
                                else if (ext == ".js") ctx.Response.ContentType = "application/javascript";
                                else if (ext == ".css") ctx.Response.ContentType = "text/css";
                                else if (ext == ".json") ctx.Response.ContentType = "application/json";
                                else if (ext == ".png") ctx.Response.ContentType = "image/png";
                                else if (ext == ".svg") ctx.Response.ContentType = "image/svg+xml";
                                else if (ext == ".ico") ctx.Response.ContentType = "image/x-icon";
                                else if (ext == ".woff2") ctx.Response.ContentType = "font/woff2";

                                ctx.Response.ContentLength64 = buffer.Length;
                                ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
                                ctx.Response.OutputStream.Close();
                            }
                            catch { }
                        });
                    }
                }
                catch { }
            });
            serverThread.IsBackground = true;
            serverThread.Start();

            // Find Microsoft Edge executable for native desktop window app-mode
            string appUrl = "http://127.0.0.1:" + port + "/";
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe");
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            if (File.Exists(edgePath))
            {
                psi.FileName = edgePath;
                // --app gives standalone desktop window with no address bar or tabs
                psi.Arguments = "--app=\"" + appUrl + "\" --window-size=1280,850 --disable-features=TranslateUI";
            }
            else
            {
                // Fallback to default browser
                psi.FileName = appUrl;
                psi.UseShellExecute = true;
            }

            try
            {
                Process proc = Process.Start(psi);
                if (proc != null)
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("خطأ أثناء تشغيل نافذة البرنامج: " + ex.Message);
            }
            finally
            {
                try
                {
                    listener.Stop();
                    listener.Close();
                }
                catch { }
            }
        }
    }
}
