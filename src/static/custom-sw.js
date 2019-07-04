/* eslint-env node, serviceworker */
/* global localforage */
importScripts('https://cdnjs.cloudflare.com/ajax/libs/localforage/1.7.3/localforage.min.js');

localforage.config({
  driver: localforage.INDEXEDDB, // Force WebSQL; same as using setDriver()
  name: 'LikeCoin LikeButton',
  version: 1.0,
  storeName: 'likebutton_token',
});

self.addEventListener('fetch', async (event) => {
  const req = event.request;
  console.log(req.url);
  const res = await localforage.getItem(req.url);
  if (res) console.log('bingo');
  else await localforage.setItem(req.url, true);
});
