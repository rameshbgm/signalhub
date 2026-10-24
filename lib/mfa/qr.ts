import QRCode from "qrcode";

/**
 * The otpauth link as an inline image. Drawn on the server so the setup key is
 * never sent to a third-party QR service and never put in a URL.
 */
export function qrDataUrl(otpauthUri: string) {
  return QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1, width: 224 });
}
