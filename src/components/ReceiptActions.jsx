import DocActions from './DocActions'
import { fetchReceipt, fetchRefund } from '../receipts'
import { downloadReceipt, shareReceipt, downloadRefund, shareRefund } from '../invoice'

export default function ReceiptActions({ receiptId, label = 'receipt', className = '' }) {
  return <DocActions load={() => fetchReceipt(receiptId)} download={downloadReceipt} share={shareReceipt} label={label} className={className} />
}

export function RefundActions({ refundId, label = 'refund note', className = '' }) {
  return <DocActions load={() => fetchRefund(refundId)} download={downloadRefund} share={shareRefund} label={label} className={className} />
}
