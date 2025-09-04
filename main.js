
  const contentEl = document.getElementById('content');
  const masterXMLURL = 'https://raw.githubusercontent.com/BenoitValdes/manwha_rss_feeds/refs/heads/main/master.xml';

  // Grab templates and remove from DOM
  const cardTemplate = document.getElementById('cardTemplate');
  const backLinkTemplate = document.getElementById('backLinkTemplate');
  const bookListTemplate = document.getElementById('bookListTemplate');
  const chapterListTemplate = document.getElementById('chapterListTemplate');
  const topNavBar = document.getElementById('topNav');
  const chapterItem = document.getElementById('chapterItem');
  const chapterAction = document.getElementById('chapterAction');
  const downloadIcon = document.getElementById('downloadIcon');
  const removeIcon = document.getElementById('removeIcon');
  const loadingIcon = document.getElementById('loadingIcon');


  cardTemplate.remove();
  backLinkTemplate.remove();
  bookListTemplate.remove();
  chapterListTemplate.remove();
  topNavBar.remove();
  chapterItem.remove();
  chapterAction.remove();
  downloadIcon.remove();
  removeIcon.remove();
  loadingIcon.remove();

  const downloadedLocalStorageKey = 'chapterDownloaded'
  const downloadedChaptersLS = JSON.parse(
    localStorage.getItem(downloadedLocalStorageKey) || '{}'
  );

  async function downloadChapter(images) {

    const swReg = navigator.serviceWorker;
    
    // Use MessageChannel to wait for response from SW
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      console.log("Download finished:", event.data);
      alert("Chapter downloaded!");
    };

    navigator.serviceWorker.controller.postMessage(
      {type: "CACHE_IMAGES", payload: images},
      [channel.port2]
    );
  }

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
        await cacheUrl(img, true)
        storedData.push(img)
      }
      downloadedChaptersLS[this.chapterGuid] = storedData
      localStorage.setItem(downloadedLocalStorageKey, JSON.stringify(downloadedChaptersLS));

      this.setState(3);
    }

    async delete() {
      this.setState(4);

      for (const url of downloadedChaptersLS[this.chapterGuid]){
        await removeUrlFromCache(url)
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


  // Ask the service worker to cache the data from the URL we provide
  async function cacheUrl(url, isImage=false) {
    return new Promise((resolve, reject) => {
      if (navigator.onLine && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {

        function onMessage(event) {
          if (event.data && event.data.type === 'CACHE_URL_DONE' && event.data.url === url) {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve();
          }
        }

        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URL', url: url, isImage: isImage});
      }
    });
  }

  // Ask the service worker to remove the URL from the cache
  async function removeUrlFromCache(url) {
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

  // Make the URL hashable to retrieve all the data and load the content
  function getHashParams() {
    const hash = location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
      book: params.get('book'),
      chapter: params.get('chapter')
    };
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
    console.log('markChapterViewed called with guid:', guid);
    const viewed = JSON.parse(localStorage.getItem('viewedChapters') || '[]');
    if (!viewed.includes(guid)) {
        viewed.push(guid);
        localStorage.setItem('viewedChapters', JSON.stringify(viewed));
    }
    }

  // Cleate the dumb navbar item
  function createBackLink(text, href) {
    const clone = backLinkTemplate.content.cloneNode(true);
    const a = clone.querySelector('a');
    a.textContent = text;
    a.href = href;
    return clone;
  }

  function createTopNav(text, href) {
    const navBar = topNavBar.content.cloneNode(true);
    const a = navBar.querySelector('a');
    a.href = href;
    const span = navBar.querySelector('div.title');
    span.textContent = text;
    return navBar;

  }

  function createChapterItem(text, link, viewed, downloadBtn=null) {
    const item = chapterItem.content.cloneNode(true);
    const li = item.querySelector('li');
    const a = item.querySelector('a');
    a.href = link
    const titleSpan = item.querySelector('span.item-title');
    titleSpan.textContent = text
    if (viewed) {
      a.classList.add('viewed');
    }
    if (downloadBtn) {
      li.appendChild(downloadBtn.getElement());
    }
    return item
  }

  // Loading the Main hage
  async function renderMaster() {
    // I want an extra button do add the feeds
    clearContent();
    contentEl.textContent = 'Loading master feed...';
    try {
      const xml = await loadXML(masterXMLURL);
      console.log(xml)
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
        console.log(card)
        // continue
        const title = book.querySelector('title').textContent;
        const url = book.querySelector('link').textContent;
        const img = await getChapterImages(book);
        let img_url = '';
        if (img[0] != 'Null') {
            img_url = img[0];
            cacheUrl(img_url, true);
        }
        const img_item = card.querySelector("img");
        img_item.src = img_url;

        const anchor = card.querySelector(".card");
        anchor.href = `#book=${encodeURIComponent(url)}`;
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
        const chapterLink = `#book=${encodeURIComponent(bookUrl)}&chapter=${encodeURIComponent(guid)}`
        
        let btn = null;
        if (navigator.onLine){
          btn = new DownloadChapterBtn(bookUrl, guid);
        }
        const li = createChapterItem(title, chapterLink, isViewed, btn);
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

  let abortLoading = false;
  // Add the images 1 by 1 in the order so we don't get spoiled with slow connection
  async function loadImagesSequentially(imgUrls, container) {
    // abortLoading = false;
    for (const url of imgUrls) {
        const img = document.createElement('img');
        //
        if (abortLoading) break;
        // Optionally, you can add some "loading" placeholder or style here

        container.appendChild(img);

        await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // ignore error and move on
        img.src = url; // start loading image
        });
    }
    }

  async function renderChapter(bookUrl, chapterGuid) {
    clearContent();
    contentEl.innerHTML = `<p>Loading chapter ${chapterGuid} from book ${bookUrl}...</p>`;
    try {
      const xml = await loadXML(bookUrl);
      const bookTitle = xml.querySelector('channel > title').textContent || 'Book';
      const chapter = await getChapterItem(xml, chapterGuid)
      if (!chapter) {
        renderError('Chapter not found.');
        return;
      }
      clearContent();

      contentEl.appendChild(createTopNav(chapter.querySelector('title').textContent, `#book=${encodeURIComponent(bookUrl)}`));
      const imgs = await getChapterImages(chapter);
      if (imgs.length === 0) {
        contentEl.appendChild(document.createTextNode('No images found in chapter.'));
        return;
      }

      const imageContainer = document.createElement("div");
      imageContainer.classList.add("images-container");
      contentEl.appendChild(imageContainer);
      await loadImagesSequentially(imgs, imageContainer);

      // move that later in the section that will show the next chapter button.
      // It'll mean we went at the end of the view!
      markChapterViewed(chapterGuid);
    } catch(e) {
      renderError('Error loading chapter: ' + e.message);
    }
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
