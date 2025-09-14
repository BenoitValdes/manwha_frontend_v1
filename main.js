
  const contentEl = document.getElementById('content');
  const masterXMLURL = 'https://raw.githubusercontent.com/BenoitValdes/manwha_rss_feeds/refs/heads/main/master.xml';
  let abortLoading = false;
  let navbarsHidden = false;
  const viewedChapterStorageKey = 'viewedChapters';
  const downloadedLocalStorageKey = 'chapterDownloaded';
  const downloadedChaptersLS = JSON.parse(
    localStorage.getItem(downloadedLocalStorageKey) || '{}'
  );

  // Grab templates and remove them from DOM
  const cardTemplate = document.getElementById('cardTemplate');
  cardTemplate.remove();
  const chapterListTemplate = document.getElementById('chapterListTemplate');
  chapterListTemplate.remove();
  const topNavBar = document.getElementById('topNav');
  topNavBar.remove();
  const bottomNavBar = document.getElementById('bottomNav');
  bottomNavBar.remove();
  const chapterItem = document.getElementById('chapterItem');
  chapterItem.remove();
  const chapterAction = document.getElementById('chapterAction');
  chapterAction.remove();
  const downloadIcon = document.getElementById('downloadIcon');
  downloadIcon.remove();
  const removeIcon = document.getElementById('removeIcon');
  removeIcon.remove();
  const loadingIcon = document.getElementById('loadingIcon');
  loadingIcon.remove();


  class DownloadChapterBtn {
    constructor(bookUrl, chapterGuid) {
      this.bookUrl = bookUrl;
      this.chapterGuid = chapterGuid;
      // 1 for not downloaded, 2 for downloading, 3 for downloaded, 4 while removing
      // 1 will trigger the download method
      // 2 and 4 should do nothing as it's disabled
      // 3 will trigger the delete method
      // we need to check in the local storage if the chapter has been downloaded already.
      this.state = this.chapterGuid in downloadedChaptersLS ? 3 : 1;
      this.button = chapterAction.content.cloneNode(true).querySelector('button');
      this.updteButtonLook()
      this.button.addEventListener('click', () => this.handleClick());
    }

    updteButtonLook() {
      this.button.disabled = false;
      switch(this.state){
        // allow download
        case 1:
          this.button.innerHTML = '';
          this.button.appendChild(downloadIcon.content.cloneNode(true));
          break;

        // Currently downloading
        case 2:
          this.button.innerHTML = '';
          this.button.appendChild(loadingIcon.content.cloneNode(true));
          this.button.disabled = true;
          break;

        // Allow remove
        case 3:
          this.button.innerHTML = '';
          this.button.appendChild(removeIcon.content.cloneNode(true));
          break;

        // Currently removing
        case 4:
          this.button.innerHTML = '';
          this.button.appendChild(loadingIcon.content.cloneNode(true));
          this.button.disabled = true;
          break;
        default:
          this.button.textContent = 'There is a bug';
          this.button.disabled = true;
          
      }
    }

    async handleClick() {
      if (this.state === 1) {
        await this.download();
      } else if (this.state === 3) {
        await this.delete();
      }
    }

    async download() {
      this.setState(2);

      const xml = await loadXML(this.bookUrl);
      const chapter = await getChapterItem(xml, this.chapterGuid)
      const imgs = await getChapterImages(chapter);
      const storedData = []
      for (const img of imgs) {
        await cacheImage(img)
        storedData.push(img)
      }
      downloadedChaptersLS[this.chapterGuid] = storedData
      localStorage.setItem(downloadedLocalStorageKey, JSON.stringify(downloadedChaptersLS));

      this.setState(3);
    }

    async delete() {
      this.setState(4);

      for (const url of downloadedChaptersLS[this.chapterGuid]){
        await removeImageFromCache(url)
      }
      
      delete downloadedChaptersLS[this.chapterGuid]
      localStorage.setItem(
        downloadedLocalStorageKey, JSON.stringify(downloadedChaptersLS)
      );

      this.setState(1);
    }

    setState(state) {
      this.state = state;
      this.updteButtonLook()
    }

    getElement() {
      return this.button;
    }
  }


  // Ask the service worker to cache an image from the URL we provide
  async function cacheImage(url) {
    return new Promise((resolve, reject) => {
      if (navigator.onLine && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {

        function onMessage(event) {
          if (event.data && event.data.type === 'CACHE_URL_DONE' && event.data.url === url) {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
          }
        }

        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_URL',
          url: url
        });
      }
    });
  }

  // Ask the service worker to remove the URL from the cache
  async function removeImageFromCache(url) {
    return new Promise((resolve, reject) => {
      if (navigator.onLine && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {

        function onMessage(event) {
          if (event.data && event.data.type === 'REMOVE_URL_DONE' && event.data.url === url) {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
          }
        }

        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'REMOVE_URL', url });
      } else {
        reject('Service worker controller not available or offline');
      }
    });
  }

  // Lazy function to load an XML and return the content.
  async function loadXML(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error('Failed to load ' + url);
    const text = await res.text();
    return new window.DOMParser().parseFromString(text, "application/xml");
  }

  async function getChapterItem(bookXml, chapterGuid) {
    return [
      ...bookXml.querySelectorAll('item')
    ].find(item => item.querySelector('guid').textContent === chapterGuid);
  }

  async function getChapterImages(chapterXml) {
    const parser = new DOMParser();
    const contentXml = parser.parseFromString(
      chapterXml.querySelector('content\\:encoded, encoded').textContent || '', 'text/html'
    );
    const imgs = [...contentXml.querySelectorAll('img')];
    return [...imgs].map(img => img.getAttribute('src'));
  }

  async function getBookImage(bookXML){
    const img = await getChapterImages(bookXML);
    if (img[0] != 'Null') {
        return img[0];
    }
    return 'https://dummyimage.com/692x1002/999/fff&text=NotFound'
  }

  // Clear the content DIV that is recieving the page content.
  function clearContent() {
    contentEl.innerHTML = '';
  }

  // Display the caught error message to help to debug.
  function renderError(msg) {
    clearContent();
    contentEl.textContent = msg;
  }

  // Store chapter viewed
    function markChapterViewed(guid) {
    const viewed = JSON.parse(
      localStorage.getItem(viewedChapterStorageKey) || '[]'
    );
    if (!viewed.includes(guid)) {
        viewed.push(guid);
        localStorage.setItem(viewedChapterStorageKey, JSON.stringify(viewed));
    }
    }


  function createTopNav(text, href) {
    const navBar = topNavBar.content.cloneNode(true);
    const a = navBar.querySelector('a');
    a.href = href;
    const span = navBar.querySelector('div.title');
    span.textContent = text;
    return navBar;

  }

  function createBottomNav(text, prefHref=null, nextHref=null) {
    const navBar = bottomNavBar.content.cloneNode(true);
    const span = navBar.querySelector('span.chapter-title');
    span.textContent = text;

    const prevElem = navBar.querySelector('a.prev-icon');
    if (prefHref) {
      prevElem.href = prefHref;
    }
    else {
      prevElem.remove()
    }

    const nextElem = navBar.querySelector('a.next-icon');
    if (nextHref) {
      nextElem.href = nextHref;
    }
    else {
      nextElem.remove()
    }
    return navBar;

  }

  function parsePubDate(pubDateStr) {
    const date = new Date(pubDateStr);

    // format like 03 Sep 2025
    const formatted = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    // calculate "x days ago"
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let relative;
    if (diffDays === 0) {
      relative = "today";
    } else if (diffDays === 1) {
      relative = "1 day ago";
    } else if (diffDays <= 6) {
      relative = `${diffDays} days ago`;
    } else {
      relative = formatted; // fallback to the date
    }

    return relative;
  }

  function createChapterItem(text, date, link, viewed, downloadBtn=null) {
    const item = chapterItem.content.cloneNode(true);
    const li = item.querySelector('li');
    const a = item.querySelector('a');
    a.href = link
    const titleSpan = item.querySelector('span.item-title');
    titleSpan.textContent = text

    const dateSpan = item.querySelector('span.item-date');
    dateSpan.textContent = parsePubDate(date)

    if (viewed) {
      a.classList.add('viewed');
    }
    if (downloadBtn) {
      li.appendChild(downloadBtn.getElement());
    }
    return item
  }

  // Add the images 1 by 1 in the order so we don't get spoiled with slow connection
  async function loadImagesSequentially(imgUrls, container) {
    for (const url of imgUrls) {
        const img = document.createElement('img');
        if (abortLoading) break;

        container.appendChild(img);

        await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
        });
      }
  }

  function buildUrl(book, chapter=null) {
    let url = `#book=${encodeURIComponent(book)}`;
    if (chapter) {
      url += `&chapter=${encodeURIComponent(chapter)}`
    }
    return url;
  }

  // Loading the Main hage
  async function renderMaster() {
    // I want an extra button do add the feeds
    clearContent();
    contentEl.textContent = 'Loading master feed...';
    try {
      const xml = await loadXML(masterXMLURL);
      const books = [...xml.querySelectorAll('item')];
      clearContent();
      if (books.length === 0) {
        contentEl.textContent = 'No books found in master feed.';
        return;
      }
      const containerDiv = document.createElement("div");
      containerDiv.classList.add("container");
      for (const book of books) {
        const card = cardTemplate.content.cloneNode(true);
        // continue
        const title = book.querySelector('title').textContent;
        const url = book.querySelector('link').textContent;
        const img = await getBookImage(book)
        if (img) {
          cacheImage(img);
        }
        const img_item = card.querySelector("img");
        img_item.src = img;

        const anchor = card.querySelector(".card");
        anchor.href = buildUrl(url);
        const txt = card.querySelector(".card-text");
        txt.textContent = title;
        containerDiv.appendChild(card);
      }
      contentEl.appendChild(containerDiv);
    } catch(e) {
      renderError('Error loading master feed: ' + e.message);
    }
  }

  // Loading the Book page
  async function renderBook(bookUrl) {
    clearContent();
    contentEl.innerHTML = `<p>Loading book feed: ${bookUrl}...</p>`;
    const viewedChapters = JSON.parse(
        localStorage.getItem('viewedChapters') || '[]'
    );

    try {
      const xml = await loadXML(bookUrl);
      const bookTitle = xml.querySelector('channel > title').textContent || 'Book';
      const chapters = [...xml.querySelectorAll('item')];
      clearContent();

      contentEl.appendChild(createTopNav(bookTitle, '#'));
      
      if (chapters.length === 0) {
        contentEl.appendChild(document.createTextNode('No chapters found.'));
        return;
      }
      const downloadedChaptersLS = JSON.parse(
        localStorage.getItem(downloadedLocalStorageKey) || '{}'
      );

      const ul = chapterListTemplate.content.querySelector('ul').cloneNode();
      for (const chap of chapters) {
        const title_obj = chap.querySelector('title')
        const guid_obj = chap.querySelector('guid')
        if (!title_obj || !guid_obj){
          console.error('Issue with ' + bookTitle + ' and chapter: ', chap)
          continue
        }
        const title = title_obj.textContent;
        const guid = guid_obj.textContent;

        // When offLine and if the chapter hasn't been dowloaded, then we don't show it!
        if (!navigator.onLine && !downloadedChaptersLS[guid]){
          continue
        }

        const isViewed = viewedChapters.includes(guid)
        const chapterLink = buildUrl(bookUrl, guid);

        const chapterDate = chap.querySelector('pubDate').textContent

        let btn = null;
        if (navigator.onLine){
          btn = new DownloadChapterBtn(bookUrl, guid);
        }
        const li = createChapterItem(title, chapterDate, chapterLink, isViewed, btn);
        ul.appendChild(li);
      }
      if (ul.hasChildNodes()) {
        contentEl.appendChild(ul);
      }
      else {
        const p = document.createElement('p')
        p.textContent = 'No chapters in this book...'
        contentEl.appendChild(p)

      }
    } catch(e) {
      renderError('Error loading book feed: ' + e.message);
    }
  }

  // Loading the Chapter content
  async function renderChapter(bookUrl, chapterGuid) {
    clearContent();
    contentEl.innerHTML = `<p>Loading chapter ${chapterGuid} from book ${bookUrl}...</p>`;
    try {
      const xml = await loadXML(bookUrl);
      const bookTitle = xml.querySelector('channel > title').textContent || 'Book';
      const chapters = [...xml.querySelectorAll('item')];
      let chapter = null;
      let next = null;
      let prev = null;
      for (let i = 0; i < chapters.length; i++) {
        const chap = chapters[i];
        if (chap.querySelector('guid').textContent != chapterGuid){
          continue
        }
        chapter = chap;
        // As the order is from newest to oldest, we invest the next/prev values
        next = i > 0 ? chapters[i - 1] : null;
        prev = i < chapters.length - 1 ? chapters[i + 1] : null;
      }

      if (!chapter) {
        renderError('Chapter not found.');
        return;
      }
      clearContent();

      navbarsHidden = false;

      contentEl.appendChild(createTopNav(
        bookTitle,
        buildUrl(bookUrl)
      ));

      contentEl.appendChild(createBottomNav(
        chapter.querySelector('title').textContent,
        prev ? buildUrl(bookUrl, prev.querySelector('guid').textContent) : null,
        next ? buildUrl(bookUrl, next.querySelector('guid').textContent) : null,
      ));
      const topNavBarElem = contentEl.querySelector('div.top-navbar');
      const bottomNavBarElem = contentEl.querySelector('div.bottom-navbar');
      const imgs = await getChapterImages(chapter);
      if (imgs.length === 0) {
        contentEl.appendChild(document.createTextNode('No images found in chapter.'));
        return;
      }

      const imageContainer = document.createElement("div");
      imageContainer.classList.add("images-container");
      contentEl.appendChild(imageContainer);      

      // Handle scroll to hide navbars
      imageContainer.addEventListener("scroll", () => {
          const currentScrollY = imageContainer.scrollTop;
        if (currentScrollY >= imageContainer.scrollHeight * 0.97) {
          // Show navbars
          topNavBarElem.classList.remove("hidden");
          bottomNavBarElem.classList.remove("hidden");
          navbarsHidden = false;
          markChapterViewed(chapterGuid);

        }
        else if (!navbarsHidden) {
          // Always hide navbars on scroll, regardless of direction
          topNavBarElem.classList.add("hidden");
          bottomNavBarElem.classList.add("hidden");
          navbarsHidden = true;
        }
      });
      // Handle clicks to toggle navbars
      imageContainer.addEventListener("click", () => {
          if (navbarsHidden) {
              // Show navbars
              topNavBarElem.classList.remove("hidden");
              bottomNavBarElem.classList.remove("hidden");
              navbarsHidden = false;
          } else {
              // Hide navbars
              topNavBarElem.classList.add("hidden");
              bottomNavBarElem.classList.add("hidden");
              navbarsHidden = true;
          }
      });
      // Prevent drag-and-drop behavior
      imageContainer.addEventListener("dragstart", (event) => {
          event.preventDefault();
      });

      await loadImagesSequentially(imgs, imageContainer);
    } catch(e) {
      renderError('Error loading chapter: ' + e.message);
    }
  }


  // Make the URL hashable to retrieve all the data and load the content
  function getHashParams() {
    const hash = location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
      book: params.get('book'),
      chapter: params.get('chapter')
    };
  }

  async function router() {
    abortLoading = true;
    const {book, chapter} = getHashParams();
    if (!book) {
      await renderMaster();
    } else if (book && !chapter) {
      await renderBook(book);
    } else if (book && chapter) {
      abortLoading = false;
      await renderChapter(book, chapter);
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('load', router);
