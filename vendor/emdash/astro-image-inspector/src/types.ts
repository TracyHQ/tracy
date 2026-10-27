export interface ImageInspectorOptions {
  /** Enable the Image Inspector toolbar app. Default: true */
  enabled?: boolean;
  /** Label shown in the dev toolbar. Default: "Image Inspector" */
  appName?: string;
  /** Only show the panel when there are warnings. Default: false */
  showWarningsOnly?: boolean;
  /** Warn when the image is rendered larger than its natural size. Default: true */
  warnOnUpscale?: boolean;
  /** Warn when natural size is more than 2x rendered size. Default: true */
  warnOnOversized?: boolean;
}

export interface ImageInfo {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  loading: string;
  decoding: string;
  warnings: string[];
}
