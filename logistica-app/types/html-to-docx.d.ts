declare module 'html-to-docx' {
  interface HtmlToDocxOptions {
    table?: {
      row?: {
        cantSplit?: boolean
      }
    }
    pageNumber?: boolean
    footer?: boolean
  }

  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: HtmlToDocxOptions,
    footerHTMLString?: string | null
  ): Promise<Buffer>

  export default HTMLtoDOCX
}
