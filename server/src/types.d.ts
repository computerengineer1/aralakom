declare module 'arabic-reshaper' {
  interface Reshaper {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  }
  const reshaper: Reshaper;
  export default reshaper;
}
