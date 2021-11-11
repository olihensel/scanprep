import FileType from 'file-type';
import * as fs from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFImage, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

const quirc = require('node-quirc');

export async function getQrCodes(blob: Buffer) {
  const img = await sharp(blob);
  const blackPoint = 70;
  const whitePoint = 203;
  const a = 255 / (whitePoint - blackPoint);
  const b = -blackPoint * a;

  const resized1 = await img.jpeg().linear(a, b).resize(1200).toBuffer();
  const resized2 = await img.jpeg().resize(1200).toBuffer();
  const resized3 = await img.jpeg().resize(600).toBuffer();
  const resized5 = await img.jpeg().resize(2000).toBuffer();
  // well.. this part obviously sucks, but it at least increases the likelyhood of finding a qr code
  const qrCodes: string[] = [
    ...(await getQrCodesForJpegBuffer(resized1)),
    ...(await getQrCodesForJpegBuffer(resized2)),
    ...(await getQrCodesForJpegBuffer(resized3)),
    ...(await getQrCodesForJpegBuffer(resized5)),
  ];
  console.log(qrCodes);
  return qrCodes;

  async function getQrCodesForJpegBuffer(blob: Buffer): Promise<string[]> {
    return (await quirc.decode(blob)).map((v: any) => v?.data?.toString('utf-8')).filter((f: string) => f);
  }
}

export async function extractImagesFromPdf(filePath: string) {
  // source: https://github.com/Hopding/pdf-lib/issues/962#issuecomment-897824255
  const pdfDoc = await PDFDocument.load(await fs.readFile(filePath));
  const enumeratedIndirectObjects = pdfDoc.context.enumerateIndirectObjects();
  const images: Buffer[] = [];
  enumeratedIndirectObjects.forEach((x) => {
    const pdfObject = x[1];

    if (!(pdfObject instanceof PDFRawStream)) return;

    const { dict } = pdfObject;

    const subtype = dict.get(PDFName.of('Subtype'));
    if (subtype == PDFName.of('Image')) {
      images.push(Buffer.from(pdfObject.contents));
    }
  });
  const imageInfos = await Promise.all(
    images.map(async (image) => {
      return { meta: await FileType.fromBuffer(image), data: image };
    }),
  );

  return imageInfos.filter((f) => f?.meta?.mime?.startsWith('image/'));
}

export async function splitPdf(inDir: string, outDir: string, filePath: string) {
  const images = await extractImagesFromPdf(join(inDir, filePath));
  let pdfIndex = 0;
  let currentOutputPdf: PDFDocument = await PDFDocument.create();

  async function savePdfPart() {
    if (currentOutputPdf && currentOutputPdf.getPageCount() > 0) {
      const outputFile = `${filePath.replace(/\//g, '_').replace(/\.pdf$/, '')}-${pdfIndex.toString().padStart(3, '0')}.pdf`;
      console.log(`writing ${currentOutputPdf.getPageCount()} pages to ${outputFile}`);
      const pdfBuffer = await currentOutputPdf.save();
      await fs.writeFile(join(outDir, outputFile), pdfBuffer);
      pdfIndex++;
    }
  }
  for (const image of images) {
    const qrCodes = await getQrCodes(image.data);
    // possible qr code texts: SPLIT, SPLITNEXT, DOC00000-DOC99999
    const split = qrCodes.includes('SPLIT') || qrCodes.some((qrCode) => qrCode.match(/^DOC\d{5}$/));
    const splitNext = qrCodes.includes('SPLITNEXT');
    if (split || splitNext) {
      await savePdfPart();
      currentOutputPdf = await PDFDocument.create();
      if (splitNext) {
        // splitnext means skip the current page - used with blank pages
        continue;
      }
    }
    let pdfImage: PDFImage | undefined;
    if (image?.meta?.mime === 'image/jpeg') {
      pdfImage = await currentOutputPdf.embedJpg(image.data);
    } else if (image?.meta?.mime === 'image/png') {
      pdfImage = await currentOutputPdf.embedPng(image.data);
    } else {
      const jpg = await sharp(image.data).jpeg().toBuffer();
      pdfImage = await currentOutputPdf.embedJpg(jpg);
    }
    const page = await currentOutputPdf.addPage();

    await page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }
  await savePdfPart();
}
