ALTER TABLE products
  ADD COLUMN shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
    AFTER price;

UPDATE products p
JOIN users u ON u.id = p.seller_id
SET shipping_fee = u.delivery_fee
WHERE p.shipping_fee = 0.00
  AND u.delivery_fee > 0.00;
