import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class merger: conditional classes, last Tailwind utility wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
