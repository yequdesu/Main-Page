export const LEVA_THEME = {
  colors: {
    elevation1: '#101927',
    elevation2: '#162132',
    elevation3: '#2c3e54',
    accent1: '#23617c',
    accent2: '#3180a0',
    accent3: '#80cbe5',
    highlight1: '#9baabd',
    highlight2: '#becbdc',
    highlight3: '#edf3fb',
  },
  fontSizes: { root: '12px', toolTip: '12px' },
  sizes: { controlWidth: '140px' },
}
export function downloadCanvas(canvas: HTMLCanvasElement | string, name: string) {
  const a = document.createElement('a')
  a.download = name
  a.href = typeof canvas === 'string' ? canvas : canvas.toDataURL('image/png')
  a.click()
}
