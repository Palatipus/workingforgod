// The name the item was sold under (kept even if the product is renamed later)
export function itemLabel(item) {
  return item.product_name || item.products?.name
}
