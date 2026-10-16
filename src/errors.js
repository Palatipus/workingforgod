// Every error the app shows gets a code, so staff can quote it to the developer.
// Codes for mistakes staff can fix themselves show the reason and the code.
// Technical problems ask them to send the developer a screenshot (code, details and page).
// This file has no imports so `npm run error-codes` can build the error codes PDF from it.
//
// CODES NEVER CHANGE: staff and the printed PDF rely on them. Never renumber or reuse a code.
// For a new error, add a new code after the last one in its group, then run `npm run error-codes`.

// Who staff should contact about technical problems
export const developer = {
  name: 'Casper',
  phone: '0591241992',
}

// What staff should send: a screenshot carries the code, the details and the time
export function reportLine(code, detail) {
  const page = typeof window !== 'undefined' ? window.location.pathname : ''
  return 'Take a screenshot of this message and send it to ' + developerContact() + ' on WhatsApp. Code ' + code +
    (detail ? ': ' + String(detail).slice(0, 160) : '') + (page ? ' [' + page + ']' : '')
}

export function developerContact() {
  return developer.phone ? developer.name + ' (' + developer.phone + ')' : developer.name
}

// Problems staff can fix themselves. `match` is tested against the message from the database.
// area groups them in the PDF. E1xx orders, E2xx payments, E3xx returns and deliveries,
// E4xx stock and products, E5xx accounts and team.
export const userErrors = [
  // ORDERS
  { code: 'E101', area: 'Orders', match: /^An order needs at least one item/, meaning: 'The order was sent with no items.', action: 'Add at least one product or extra charge.' },
  { code: 'E102', area: 'Orders', match: /^Quantity must be at least 1/, meaning: 'A line has a quantity of 0, a negative number or a fraction.', action: 'Enter a whole number of 1 or more.' },
  { code: 'E103', area: 'Orders', match: /^Every item needs a price/, meaning: 'Tried to finish an order with a price still blank.', action: 'Fill in every price, or save it as pending and finish later.' },
  { code: 'E104', area: 'Orders', match: /^Price must be above 0/, meaning: 'A price of 0 or less was entered.', action: 'Enter a price above 0.' },
  { code: 'E105', area: 'Orders', match: /^Give each extra charge a description/, meaning: 'An extra charge (service fee, delivery...) has no description.', action: 'Type what the charge is for, or remove the line.' },
  { code: 'E106', area: 'Orders', match: /^A product in this order is no longer available/, meaning: 'A product was removed from inventory while the order was being made.', action: 'Remove that product from the order, or ask an admin to restore it.' },
  { code: 'E107', area: 'Orders', match: /^The same product is listed twice/, meaning: 'One product appears on two lines.', action: 'Keep one line with the full quantity.' },
  { code: 'E108', area: 'Orders', match: /^Customer not found/, meaning: 'The customer no longer exists.', action: 'Go back and choose the customer again.' },
  { code: 'E109', area: 'Orders', match: /^This pending order was already finished or deleted/, meaning: 'Someone else finished or deleted this pending order first.', action: 'Check the Orders page: it is either an invoice now or gone.' },
  { code: 'E110', area: 'Orders', match: /^Only the salesperson who saved this pending order or an admin/, meaning: 'Only the person who saved a pending order, or an admin, can change, finish or delete it.', action: 'Ask that salesperson or an admin.' },
  { code: 'E111', area: 'Orders', match: /^Order not found/, meaning: 'The order does not exist, or it was cancelled.', action: 'Refresh the Orders page.' },

  // PAYMENTS
  { code: 'E201', area: 'Payments', match: /^Amount paid cannot be negative/, meaning: 'A negative amount was entered as paid.', action: 'Enter 0 or more.' },
  { code: 'E202', area: 'Payments', match: /^Amount (paid )?must be (above 0|between)/, meaning: 'The amount is 0, or more than what is owed.', action: 'Enter an amount above 0 and no more than the balance shown.' },
  { code: 'E203', area: 'Payments', match: /^Enter the amount the customer owed/, meaning: 'An opening balance was entered without an amount.', action: 'Enter the amount above 0.' },
  { code: 'E204', area: 'Payments', match: /^The date cannot be in the future/, meaning: 'An opening balance date is after today.', action: 'Choose today or an earlier date.' },
  { code: 'E205', area: 'Payments', match: /^There is no credit to use, or nothing is owed/, meaning: 'The customer has no credit left, or owes nothing.', action: 'Refresh the customer page; nothing needs doing.' },
  { code: 'E206', area: 'Payments', match: /^(Payment not found|Receipt not found or already reversed)/, meaning: 'The payment was already reversed or no longer exists.', action: 'Refresh the page.' },
  { code: 'E207', area: 'Payments', match: /^An invoice on this receipt has had a refund/, meaning: 'A payment cannot be reversed after a refund on that invoice.', action: 'Leave it as it is, or contact the developer if it must change.' },
  { code: 'E208', area: 'Payments', match: /^Only an admin can (reverse payments|enter opening balances)/, meaning: 'Only admins can reverse payments or enter opening balances.', action: 'Ask an admin.' },

  // RETURNS, CANCELLING AND DELIVERIES
  { code: 'E301', area: 'Returns and deliveries', match: /^Choose at least one item to return/, meaning: 'Return was pressed with no items chosen.', action: 'Enter how many of each item are being returned.' },
  { code: 'E302', area: 'Returns and deliveries', match: /^Only \d+ of this item are on the order/, meaning: 'Trying to return more than was sold.', action: 'Lower the quantity returned.' },
  { code: 'E303', area: 'Returns and deliveries', match: /^Item not found on this order/, meaning: 'The item is no longer on this order.', action: 'Refresh the order.' },
  { code: 'E304', area: 'Returns and deliveries', match: /^The customer has paid GHS .* more than the new total/, meaning: 'This return means money must go back to the customer, which only an admin can do.', action: 'Ask an admin to do the return.' },
  { code: 'E305', area: 'Returns and deliveries', match: /^(This order has had a refund|This order has payments|Reverse the payments on this order)/, meaning: 'An order with payments or refunds cannot be cancelled.', action: 'Use "Return items" instead, or ask an admin to reverse the payments first.' },
  { code: 'E306', area: 'Returns and deliveries', match: /^Only an admin can cancel orders/, meaning: 'Only admins can cancel orders.', action: 'Ask an admin.' },
  { code: 'E307', area: 'Returns and deliveries', match: /^This order was cancelled/, meaning: 'The order was cancelled, so nothing can be delivered on it.', action: 'Nothing to do.' },
  { code: 'E308', area: 'Returns and deliveries', match: /^(Nothing left to deliver|Deliver between)/, meaning: 'Delivering more than is still owed, or nothing is owed.', action: 'Refresh the order and enter the number still owed.' },
  { code: 'E309', area: 'Returns and deliveries', match: /^Only \d+ .+ in stock\. Record the stock you received first/, meaning: 'Not enough stock to deliver what is owed.', action: 'Record the stock that arrived (+ Stock on Inventory), then deliver.' },

  // STOCK AND PRODUCTS
  { code: 'E401', area: 'Stock and products', match: /^Only \d+ in stock, so you cannot remove/, meaning: 'An adjustment would take stock below 0.', action: 'Remove no more than what is in stock.' },
  { code: 'E402', area: 'Stock and products', match: /^(Enter how many to add or remove|Choose a reason)/, meaning: 'The stock adjustment form is not complete.', action: 'Fill in the number and the reason.' },
  { code: 'E403', area: 'Stock and products', match: /^Only an admin can (adjust stock|remove products)/, meaning: 'Only admins can adjust stock or remove products.', action: 'Ask an admin.' },
  { code: 'E404', area: 'Stock and products', match: /^(Add opening stock through stock received|Stock can only change through)/, meaning: 'Stock numbers cannot be typed in directly.', action: 'Use + Stock for deliveries from suppliers, or ask an admin to adjust stock.' },
  { code: 'E405', area: 'Stock and products', match: /^Product not found/, meaning: 'The product no longer exists.', action: 'Refresh the Inventory page.' },

  // ACCOUNTS AND TEAM
  { code: 'E501', area: 'Accounts and team', match: /^Too many attempts/, meaning: 'Ten wrong passwords in 15 minutes for this username.', action: 'Wait 15 minutes, then try again.' },
  { code: 'E502', area: 'Accounts and team', match: /^(Account not approved|Not signed in)/, meaning: 'The account is not approved (any more), or the person was signed out.', action: 'Sign in again. If it keeps happening, ask an admin to approve the account on the Team page.' },
  { code: 'E503', area: 'Accounts and team', match: /^(Admins only|Only approved users can be given a role)/, meaning: 'Something only admins can do.', action: 'Ask an admin.' },
  { code: 'E504', area: 'Accounts and team', match: /^You cannot change your own (access|role)/, meaning: 'Admins cannot remove or demote themselves.', action: 'Ask another admin.' },
  { code: 'E505', area: 'Accounts and team', match: /^(That username is already taken|Username must be)/, meaning: 'The username is taken or not allowed.', action: 'Choose another: 3-30 letters, numbers, dots, dashes or underscores.' },
  { code: 'E506', area: 'Accounts and team', match: /^Name must be 2-80 characters/, meaning: 'The name is too short or too long.', action: 'Enter 2 to 80 characters.' },
  { code: 'E507', area: 'Accounts and team', match: /already registered|already been registered/i, meaning: 'Someone already signed up with this email.', action: 'Sign in instead, or use "Forgot password".' },
  { code: 'E508', area: 'Accounts and team', match: /^Password should be|password.*(at least|characters)/i, meaning: 'The password is too short or too weak.', action: 'Use at least 6 characters.' },
]

// Technical problems: staff should contact the developer (except a weak connection, which they can retry)
export const techErrors = [
  { code: 'E900', area: 'Technical', meaning: 'The app crashed while showing a page (a bug).', action: 'Reload. Contact the developer and say which page and what you tapped.', developer: 'Check the browser console. The message is shown under the code.' },
  { code: 'E901', area: 'Technical', meaning: 'Could not reach the server: no internet, or a very weak connection.', action: 'Check the internet and try again. If the internet works and this continues, contact the developer.', developer: 'If many people get it, check that the Supabase project is not paused (free projects pause after a week unused) and status.supabase.com.' },
  { code: 'E902', area: 'Technical', meaning: 'The sign-in has expired.', action: 'Sign out and sign in again. If it continues, contact the developer.', developer: 'JWT expired or invalid. Check Supabase Auth settings.' },
  { code: 'E903', area: 'Technical', meaning: 'The database is older than the app: an update was not installed.', action: 'Contact the developer.', developer: 'A schema_update_*.sql file was not run, or the function has a different signature. Run the missing files in order.' },
  { code: 'E904', area: 'Technical', meaning: 'The database refused the action (permissions).', action: 'Contact the developer.', developer: 'Row-level security or a missing grant (42501). Check the policies on that table.' },
  { code: 'E905', area: 'Technical', meaning: 'The data clashed with something already saved.', action: 'Refresh and try again. If it continues, contact the developer.', developer: 'Constraint violation (23xxx). The message shows which constraint.' },
  { code: 'E906', area: 'Technical', meaning: 'The server took too long to answer.', action: 'Try again in a minute. If it continues, contact the developer.', developer: 'Statement timeout (57014) or gateway timeout. Look for slow queries in Supabase > Reports.' },
  { code: 'E907', area: 'Technical', meaning: 'A photo could not be uploaded.', action: 'Try a smaller photo or try again. If it continues, contact the developer.', developer: 'Supabase Storage error: check the product-images bucket, its policies and the storage quota.' },
  { code: 'E908', area: 'Technical', meaning: 'The server is down or over its limits.', action: 'Contact the developer.', developer: 'HTTP 5xx or a quota error. Check the Supabase dashboard (paused project, usage limits).' },
  { code: 'E999', area: 'Technical', meaning: 'An unexpected error not covered by any other code.', action: 'Contact the developer and read them the message shown with the code.', developer: 'Unknown error. The original message is shown after the code.' },
]

function rawMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return String(error.message || error.error_description || error.msg || error)
}

// The code for an error object from Supabase, a failed fetch or a thrown Error
export function errorCode(error, context) {
  const text = rawMessage(error)
  const user = userErrors.find((e) => e.match.test(text))
  if (user) return user
  const code = String(error?.code || '')
  const status = Number(error?.status || error?.statusCode || 0)
  let tech = 'E999'
  if (/Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed|ERR_INTERNET/i.test(text)) tech = 'E901'
  else if (code === 'PGRST301' || code === 'PGRST303' || /JWT|refresh token|session (has )?expired|not authenticated/i.test(text)) tech = 'E902'
  else if (code === 'PGRST202' || code === 'PGRST200' || code === '42883' || code === '42P01' || code === '42703' || /could not find the (function|relation|table)|schema cache|does not exist/i.test(text)) tech = 'E903'
  else if (code === '42501' || /row-level security|permission denied/i.test(text)) tech = 'E904'
  else if (code.startsWith('23') || /violates .* constraint|duplicate key/i.test(text)) tech = 'E905'
  else if (code === '57014' || status === 504 || /timeout|timed out/i.test(text)) tech = 'E906'
  else if (context === 'upload') tech = 'E907'
  else if (status >= 500 || /service unavailable|bad gateway|exceeded|quota/i.test(text)) tech = 'E908'
  return techErrors.find((e) => e.code === tech)
}

// The text to show staff
export function errorText(error, context) {
  const found = errorCode(error, context)
  const text = rawMessage(error)
  if (found.code.startsWith('E9')) {
    // Kept for the developer, who can ask staff to read it out
    if (typeof console !== 'undefined') console.error(found.code, error)
    const lead = {
      E901: 'Could not reach the server. Check your internet and try again. If it keeps happening,',
      E902: 'Your sign-in has expired. Sign out and sign in again. If it keeps happening,',
      E905: 'This clashed with something already saved. Refresh and try again. If it keeps happening,',
      E906: 'The server took too long. Try again in a minute. If it keeps happening,',
      E907: 'The photo could not be uploaded. Try again or use a smaller photo. If it keeps happening,',
    }[found.code] || 'Something went wrong.'
    const report = reportLine(found.code, found.code === 'E901' ? '' : text)
    return lead + ' ' + (lead.endsWith(',') ? report[0].toLowerCase() + report.slice(1) : report)
  }
  return text.replace(/\.?\s*$/, '.') + ' (' + found.code + ')'
}
