CREATE TABLE product_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  size VARCHAR(100) NULL,
  color VARCHAR(100) NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_options (product_id, size, color),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items
  ADD COLUMN product_variant_id INT UNSIGNED NULL AFTER product_id,
  ADD COLUMN variant_details VARCHAR(220) NULL AFTER product_variant_id,
  ADD KEY idx_order_items_variant (product_variant_id),
  ADD CONSTRAINT fk_order_items_variant
    FOREIGN KEY (product_variant_id)
    REFERENCES product_variants (id)
    ON DELETE SET NULL;
