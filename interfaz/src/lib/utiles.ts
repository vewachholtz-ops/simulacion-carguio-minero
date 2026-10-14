import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases))
}
