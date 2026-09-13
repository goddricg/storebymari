import {
  parseAccountData,
  parseShortAccountData,
  type Separator,
} from '@/lib/products/account-parser'

export const STOCK_APPEND_MAX_INPUT_LENGTH = 2_000_000
export const STOCK_APPEND_MAX_ACCOUNTS = 2_000

export type StockAppendFormat = 'short' | 'long'

export type StockAppendAccount = {
  email: string
  password: string
  details: string
}

export type StockAppendPreview = {
  detectedCount: number
  validAccounts: StockAppendAccount[]
  invalidCount: number
  invalidReasons: string[]
}

export type StockAppendPreviewInput = {
  rawInput: string
  dataFormat: StockAppendFormat
  separator: Separator
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function parseInput(input: StockAppendPreviewInput): StockAppendPreview {
  if (!input.rawInput.trim()) {
    return {
      detectedCount: 0,
      validAccounts: [],
      invalidCount: 0,
      invalidReasons: [],
    }
  }

  const parsed = input.dataFormat === 'short'
    ? parseShortAccountData(input.rawInput)
    : parseAccountData(input.rawInput, input.separator)
  const validAccounts: StockAppendAccount[] = []
  const invalidReasons: string[] = []

  parsed.forEach((account, index) => {
    const normalized = {
      email: normalize(account.email || ''),
      password: normalize(account.password || ''),
      details: normalize(account.details || account.rawLines.join('\n')),
    }

    // Token/link-only products can be valid without email/password fields.
    if (!normalized.details && (!normalized.email || !normalized.password)) {
      invalidReasons.push(`Account ${index + 1} has no deliverable data`)
      return
    }

    validAccounts.push(normalized)
  })

  return {
    detectedCount: parsed.length,
    validAccounts,
    invalidCount: invalidReasons.length,
    invalidReasons,
  }
}

export function previewStockAppend(input: StockAppendPreviewInput): StockAppendPreview {
  if (input.rawInput.length > STOCK_APPEND_MAX_INPUT_LENGTH) {
    return {
      detectedCount: 0,
      validAccounts: [],
      invalidCount: 1,
      invalidReasons: [`Input exceeds ${STOCK_APPEND_MAX_INPUT_LENGTH.toLocaleString()} characters`],
    }
  }

  const preview = parseInput(input)
  if (preview.detectedCount > STOCK_APPEND_MAX_ACCOUNTS) {
    return {
      ...preview,
      invalidCount: preview.invalidCount + 1,
      invalidReasons: [
        ...preview.invalidReasons,
        `A single append may contain at most ${STOCK_APPEND_MAX_ACCOUNTS.toLocaleString()} accounts`,
      ],
    }
  }
  return preview
}
