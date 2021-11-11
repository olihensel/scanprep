# scanprep

tool that watches a input folder for new pdfs and splits it up for better processing by marking qr-code stickers

## DISCLAIMER: this is totally untested. if you somehow find this and want to use it, you probably have to do some adjustments to better match your scanner settings.

## example qrcode sticker

![QR CODE DOC00003](./example_qrcode.png)
<br>
Valid qr codes:

- SPLIT or DOC\d{4} (DOC00000-DOC99999): new document starting with current document
- SPLITNEXT: new document with next document, current page is discarded (used for blank seperator pages)

## usage with docker-compose

```
docker-compose up -d
```

## manual usage

### installation

clone repo

```
# install depenencies of node-quirc
sudo apt install libpng-dev zlib1g-dev libjpeg-dev

cd scanprep
npm install
```

### usage

```
mkdir in
mkdir out
WATCH_DIR=./in OUT_DIR=./out npm run start
```
