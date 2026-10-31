ALTER TABLE seller_order_status
  MODIFY COLUMN status ENUM(
    'pending',
    'confirmed',
    'rejected',
    'processing',
    'shipped',
    'delivered'
  ) NOT NULL DEFAULT 'pending',
  ADD COLUMN tracking_carrier VARCHAR(100) NULL,
  ADD COLUMN tracking_number VARCHAR(120) NULL,
  ADD COLUMN shipped_at TIMESTAMP NULL,
  ADD COLUMN delivered_at TIMESTAMP NULL;

CREATE TABLE order_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  message VARCHAR(2000) NOT NULL,
  read_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_messages_conversation (order_id, seller_id, id),
  KEY idx_order_messages_unread (seller_id, sender_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id INT UNSIGNED NOT NULL,
  order_item_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_reviews_order_item (order_item_id),
  KEY idx_product_reviews_product (product_id, created_at),
  KEY idx_product_reviews_customer (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id INT UNSIGNED NOT NULL,
  order_item_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT NULL,
  status ENUM(
    'requested',
    'approved',
    'rejected',
    'received',
    'refunded'
  ) NOT NULL DEFAULT 'requested',
  seller_response TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_requests_order_item (order_item_id),
  KEY idx_return_requests_customer (customer_id, created_at),
  KEY idx_return_requests_seller (seller_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
