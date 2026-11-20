import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Serves the embeddable loader script. External sites include it with:
 *
 *   <script src="https://your-app.com/embed/widget.js"
 *           data-org="support" data-color="#5A24BA" async></script>
 *
 * It injects a floating launcher button and an iframe pointing at /widget.
 */
export async function GET(req: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || "";

  const script = `(function () {
  "use strict";
  if (window.__wtaWidgetLoaded) return;
  window.__wtaWidgetLoaded = true;

  var current = document.currentScript;
  var base = ${JSON.stringify(origin)} || (current ? new URL(current.src).origin : "");
  var org = (current && current.getAttribute("data-org")) || "support";
  var color = (current && current.getAttribute("data-color")) || "#5A24BA";

  var open = false;

  // ---- Launcher button --------------------------------------------------
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Open chat");
  btn.style.cssText = [
    "position:fixed","bottom:20px","right:20px","z-index:2147483000",
    "width:56px","height:56px","border-radius:9999px","border:none",
    "cursor:pointer","box-shadow:0 10px 25px rgba(0,0,0,.2)",
    "display:flex","align-items:center","justify-content:center",
    "background:" + color, "transition:transform .15s ease"
  ].join(";");
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  btn.onmouseenter = function () { btn.style.transform = "scale(1.05)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  // ---- Iframe panel -----------------------------------------------------
  var frame = document.createElement("iframe");
  frame.src = base + "/widget?org=" + encodeURIComponent(org);
  frame.title = "AI Support Assistant";
  frame.allow = "clipboard-write";
  frame.style.cssText = [
    "position:fixed","bottom:88px","right:20px","z-index:2147483000",
    "width:400px","height:640px","max-width:calc(100vw - 40px)",
    "max-height:calc(100vh - 110px)","border:none","border-radius:16px",
    "box-shadow:0 20px 50px rgba(0,0,0,.25)","display:none","background:#fff"
  ].join(";");

  function sizeForMobile() {
    if (window.innerWidth < 480) {
      frame.style.width = "100vw";
      frame.style.height = "100vh";
      frame.style.bottom = "0";
      frame.style.right = "0";
      frame.style.borderRadius = "0";
    }
  }

  function toggle() {
    open = !open;
    frame.style.display = open ? "block" : "none";
    btn.innerHTML = open
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
    if (open) sizeForMobile();
  }
  btn.addEventListener("click", toggle);

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
