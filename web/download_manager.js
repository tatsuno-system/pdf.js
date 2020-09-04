/* Copyright 2013 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @typedef {import("./interfaces").IDownloadManager} IDownloadManager */

import { createValidAbsoluteUrl, isPdfFile } from "pdfjs-lib";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("CHROME || GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/download_manager" shall not be used ' +
      "outside CHROME and GENERIC builds."
  );
}

function download(blobUrl, filename) {
  const a = document.createElement("a");
  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }

  // 追加変更
  // iOSのブラウザで閲覧時はダウンロードボタンを押した際に、_parentに表示するのではなく_topに表示するよう変更
  a.href = blobUrl;

  // TOPに表示することでアプリに渡したり、ファイルとして保存したり、印刷できる
  const isIOS = navigator.userAgent.match(/(iPhone|iPad|iPod)/);
  const isIPadOS = navigator.userAgent.toLowerCase().indexOf('macintosh') > -1 && 'ontouchend' in document;
  if (isIOS || isIPadOS) {
    const isIOS12 = navigator.userAgent.match(/iPhone OS 12/);
    if (isIOS12) {
      const f = location.href.split("file=")[1];
      location.href = '/pdf/web/download.php?file=' + f + '&filename=' + filename;
      return;
    }

    a.target = '_top';
  } else {
      a.target = '_parent';
  }

  if ('download' in a) {
    if (navigator.userAgent.toLowerCase().indexOf('crios') > -1 && 'ontouchend' in document) {
      // Chromeの場合はa.downloadをつけない
      } else {
        a.download = filename;
      }
  }
  // Use a.download if available. This increases the likelihood that
  // the file is downloaded instead of opened by another PDF plugin.
  if ("download" in a) {
    a.download = filename;
  }
  // <a> must be in the document for recent Firefox versions,
  // otherwise .click() is ignored.
  (document.body || document.documentElement).append(a);
  a.click();
  a.remove();
}

/**
 * @implements {IDownloadManager}
 */
class DownloadManager {
  #openBlobUrls = new WeakMap();

  downloadData(data, filename, contentType) {
    const blobUrl = URL.createObjectURL(
      new Blob([data], { type: contentType })
    );
    download(blobUrl, filename);
  }

  /**
   * @returns {boolean} Indicating if the data was opened.
   */
  openOrDownloadData(data, filename, dest = null) {
    const isPdfData = isPdfFile(filename);
    const contentType = isPdfData ? "application/pdf" : "";

    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("COMPONENTS")) &&
      isPdfData
    ) {
      let blobUrl = this.#openBlobUrls.get(data);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(new Blob([data], { type: contentType }));
        this.#openBlobUrls.set(data, blobUrl);
      }
      let viewerUrl;
      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
        // The current URL is the viewer, let's use it and append the file.
        viewerUrl = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
      } else if (PDFJSDev.test("CHROME")) {
        // In the Chrome extension, the URL is rewritten using the history API
        // in viewer.js, so an absolute URL must be generated.
        viewerUrl =
          // eslint-disable-next-line no-undef
          chrome.runtime.getURL("/content/web/viewer.html") +
          "?file=" +
          encodeURIComponent(blobUrl + "#" + filename);
      }
      if (dest) {
        viewerUrl += `#${escape(dest)}`;
      }

      try {
        window.open(viewerUrl);
        return true;
      } catch (ex) {
        console.error("openOrDownloadData:", ex);
        // Release the `blobUrl`, since opening it failed, and fallback to
        // downloading the PDF file.
        URL.revokeObjectURL(blobUrl);
        this.#openBlobUrls.delete(data);
      }
    }

    this.downloadData(data, filename, contentType);
    return false;
  }

  download(data, url, filename) {
    let blobUrl;
    if (data) {
      blobUrl = URL.createObjectURL(
        new Blob([data], { type: "application/pdf" })
      );
    } else {
      if (!createValidAbsoluteUrl(url, "http://example.com")) {
        console.error(`download - not a valid URL: ${url}`);
        return;
      }
      blobUrl = url + "#pdfjs.action=download";
    }
    download(blobUrl, filename);
  }
}

export { DownloadManager };
