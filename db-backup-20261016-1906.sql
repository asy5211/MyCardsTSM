-- MySQL dump 10.13  Distrib 8.0.46, for macos15 (x86_64)
--
-- Host: localhost    Database: tsm
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admin_staff`
--

DROP TABLE IF EXISTS `admin_staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_staff` (
  `id` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('super_admin','admin','support') NOT NULL DEFAULT 'admin',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `last_login_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_staff_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_staff`
--

LOCK TABLES `admin_staff` WRITE;
/*!40000 ALTER TABLE `admin_staff` DISABLE KEYS */;
INSERT INTO `admin_staff` VALUES ('5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','admin@tsm.test','TSM Admin','$2b$10$2345y8rRCuQzDCvT8zpq1uzflxAMaZTeN4S1GzHzyFNGphv9Xl5EW','super_admin','active','2026-10-16 17:50:10.695','2026-09-24 12:00:00.000','2026-10-16 17:50:10.696');
/*!40000 ALTER TABLE `admin_staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_type` enum('staff','user','system') NOT NULL,
  `actor_id` char(36) DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `entity_type` varchar(60) NOT NULL,
  `entity_id` char(36) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_audit_entity` (`entity_type`,`entity_id`),
  KEY `ix_audit_actor` (`actor_type`,`actor_id`),
  KEY `ix_audit_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','seller_application.approved','seller_application','8af153e6-0f77-5236-b6ba-c5426f8f9ccc','{\"note\": \"seed data\"}',NULL,'2026-09-24 12:00:00.000'),(2,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','user.registered','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:192.168.86.32','2026-10-16 01:48:01.473'),(3,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','seller_application.submitted','seller_application','4c442182-b736-4903-a77d-815ed7c22b1a','{\"documents\": 1, \"sourceType\": \"test\"}','::ffff:192.168.86.32','2026-10-16 02:32:35.060'),(4,'system',NULL,'seller_application.auto_approved_test','seller_application','4c442182-b736-4903-a77d-815ed7c22b1a','{\"userId\": \"4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88\", \"displayName\": \"Test\"}','::ffff:192.168.86.32','2026-10-16 02:32:35.071'),(5,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','user.address_updated','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:192.168.86.32','2026-10-16 02:35:19.017'),(6,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','user.password_reset_requested','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:192.168.86.32','2026-10-16 02:39:06.655'),(7,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','user.address_updated','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:192.168.86.32','2026-10-16 15:01:49.774'),(8,'staff',NULL,'staff.login_failed','staff',NULL,'{\"email\": \"armonx2005@gmail.com\"}','::ffff:127.0.0.1','2026-10-16 17:49:20.453'),(9,'staff',NULL,'staff.login_failed','staff',NULL,'{\"email\": \"test@test.com\"}','::ffff:127.0.0.1','2026-10-16 17:49:29.785'),(10,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.login_failed','staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','{\"email\": \"admin@tsm.test\"}','::ffff:127.0.0.1','2026-10-16 17:49:42.033'),(11,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.login_failed','staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','{\"email\": \"admin@tsm.test\"}','::ffff:127.0.0.1','2026-10-16 17:49:46.226'),(12,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.login_failed','staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','{\"email\": \"admin@tsm.test\"}','::ffff:127.0.0.1','2026-10-16 17:49:53.041'),(13,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.login_failed','staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','{\"email\": \"admin@tsm.test\"}','::ffff:127.0.0.1','2026-10-16 17:50:09.054'),(14,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.login','staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,'::ffff:127.0.0.1','2026-10-16 17:50:10.705'),(15,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:127.0.0.1','2026-10-16 17:50:30.936'),(16,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:127.0.0.1','2026-10-16 17:50:30.949'),(17,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','seller_application.document_viewed','seller_application','4c442182-b736-4903-a77d-815ed7c22b1a','{\"documentId\": \"7e432645-bc70-42a6-80ae-2d94a894633f\"}','::ffff:127.0.0.1','2026-10-16 17:51:01.151'),(18,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','listing.created','listing','be81448d-3018-44e1-9367-23ad2785485a','{\"product\": \"Commander Deck Case\", \"quantity\": 250, \"priceCents\": 8999, \"sourceType\": \"manufacturer_direct\", \"boxPosition\": \"Box 8 of 12\", \"distributor\": \"LLM inc\"}','::ffff:127.0.0.1','2026-10-16 17:52:34.872'),(19,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','user.address_updated','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:192.168.86.32','2026-10-16 17:53:17.183'),(20,'user','0ab81975-02bb-4f67-b04f-64ee89cfcd64','user.registered','user','0ab81975-02bb-4f67-b04f-64ee89cfcd64',NULL,'::ffff:192.168.86.32','2026-10-16 18:33:15.530'),(21,'user','0ab81975-02bb-4f67-b04f-64ee89cfcd64','seller_application.submitted','seller_application','e581ca3c-ece0-46c2-ab7e-97ec61f3412b','{\"documents\": 3, \"sourceType\": \"retail_store\"}','::ffff:192.168.86.32','2026-10-16 18:34:00.793'),(22,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','seller_application.under_review','seller_application','e581ca3c-ece0-46c2-ab7e-97ec61f3412b',NULL,'::ffff:127.0.0.1','2026-10-16 18:34:53.289'),(23,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','seller_application.declined','seller_application','e581ca3c-ece0-46c2-ab7e-97ec61f3412b','{\"userId\": \"0ab81975-02bb-4f67-b04f-64ee89cfcd64\"}','::ffff:127.0.0.1','2026-10-16 18:35:39.945'),(24,'user','0ab81975-02bb-4f67-b04f-64ee89cfcd64','seller_application.submitted','seller_application','e7e89716-f6e7-43aa-9dfa-e16e6f3c2023','{\"documents\": 2, \"sourceType\": \"distributor\"}','::ffff:192.168.86.32','2026-10-16 18:37:24.568'),(25,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','seller_application.approved','seller_application','e7e89716-f6e7-43aa-9dfa-e16e6f3c2023','{\"userId\": \"0ab81975-02bb-4f67-b04f-64ee89cfcd64\", \"displayName\": \"Test1\"}','::ffff:127.0.0.1','2026-10-16 18:37:39.511'),(26,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:127.0.0.1','2026-10-16 18:38:53.249'),(27,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',NULL,'::ffff:127.0.0.1','2026-10-16 18:38:53.263'),(28,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','0ab81975-02bb-4f67-b04f-64ee89cfcd64',NULL,'::ffff:127.0.0.1','2026-10-16 18:38:56.035'),(29,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','0ab81975-02bb-4f67-b04f-64ee89cfcd64',NULL,'::ffff:127.0.0.1','2026-10-16 18:38:56.043'),(30,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','user.suspended','user','0ab81975-02bb-4f67-b04f-64ee89cfcd64','{\"reason\": \"I don\'t need a reason\", \"username\": \"ArmonOne\"}','::ffff:127.0.0.1','2026-10-16 18:39:02.415'),(31,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','staff.user_viewed','user','0ab81975-02bb-4f67-b04f-64ee89cfcd64',NULL,'::ffff:127.0.0.1','2026-10-16 18:39:02.451'),(32,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.created','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\"}','::ffff:127.0.0.1','2026-10-16 18:40:19.507'),(33,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.image_set','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\", \"slot\": 1, \"bytes\": 199226}','::ffff:127.0.0.1','2026-10-16 18:40:27.623'),(34,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.image_set','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\", \"slot\": 2, \"bytes\": 191605}','::ffff:127.0.0.1','2026-10-16 18:40:35.089'),(35,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.image_set','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\", \"slot\": 3, \"bytes\": 184031}','::ffff:127.0.0.1','2026-10-16 18:40:37.920'),(36,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.image_set','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\", \"slot\": 1, \"bytes\": 225199}','::ffff:127.0.0.1','2026-10-16 18:40:43.646'),(37,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','product.updated','product','9f078ba5-9e41-4f43-9b5a-f46cd297c473','{\"name\": \"OP 17 The worlds strongest warriers\", \"changed\": [\"brandId\", \"productTypeId\", \"name\", \"description\", \"isActive\"]}','::ffff:127.0.0.1','2026-10-16 18:40:52.405'),(38,'staff','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','brand.created','brand','3b325a95-3be3-4b92-83f6-ce5732c2fb7f','{\"name\": \"Test\"}','::ffff:127.0.0.1','2026-10-16 18:41:18.657'),(39,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','listing.paused','listing','be81448d-3018-44e1-9367-23ad2785485a','{\"changes\": {}, \"product\": \"Commander Deck Case\"}','::ffff:127.0.0.1','2026-10-16 18:50:30.420'),(40,'user','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','listing.resumed','listing','be81448d-3018-44e1-9367-23ad2785485a','{\"changes\": {}, \"product\": \"Commander Deck Case\"}','::ffff:127.0.0.1','2026-10-16 18:50:31.374');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `brands`
--

DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brands` (
  `id` char(36) NOT NULL,
  `name` varchar(60) NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `image_key` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brands_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `brands`
--

LOCK TABLES `brands` WRITE;
/*!40000 ALTER TABLE `brands` DISABLE KEYS */;
INSERT INTO `brands` VALUES ('0c39ecde-0704-55f2-b07c-ea58a20020eb','Magic',1,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('21958bee-344a-5685-a8a4-a7bdb8048545','Star Wars',4,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('3b325a95-3be3-4b92-83f6-ce5732c2fb7f','Test',8,NULL,1,'2026-10-16 18:41:18.655','2026-10-16 18:41:18.655'),('512f9f72-4593-5244-8cfc-acc56270cebc','Panini',9,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('78af87c2-f95f-5f0a-bad9-1496737cadf2','Lorcana',3,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('9afac02e-7131-55a7-b4a7-ebc63f832992','Upper Deck',11,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('a15d4546-f55f-5a1e-8fac-df2b1fe9e37d','Topps',10,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('a3131442-b8ea-5e6c-ae7e-91729d2ab046','Dragon Ball',8,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('c4b635d5-8a31-5f95-9670-ead28aba9774','One Piece',2,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('d4770918-bc8a-5e85-af81-2bdc4fd4fc23','Naruto',7,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('d9fdef7c-b4be-5c6d-9e37-4871e216195f','Pokémon',0,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('ea877f02-22ee-5be4-873f-801c7d05b669','Union Arena',6,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904'),('fcf04e37-aaad-5629-9ecb-a93377ccc504','Rift Bound',5,NULL,1,'2026-10-16 00:26:23.904','2026-10-16 00:26:23.904');
/*!40000 ALTER TABLE `brands` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `listings`
--

DROP TABLE IF EXISTS `listings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `listings` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `seller_id` char(36) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `source` varchar(100) NOT NULL,
  `box_position` varchar(40) DEFAULT NULL,
  `condition_label` varchar(60) NOT NULL DEFAULT 'Factory Sealed',
  `quantity_available` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `source_type` enum('distributor','retail_store','manufacturer_direct','other') NOT NULL DEFAULT 'distributor',
  `distributor` varchar(120) DEFAULT NULL,
  `box_number` smallint unsigned DEFAULT NULL,
  `boxes_in_case` smallint unsigned DEFAULT NULL,
  `admin_hold` tinyint(1) NOT NULL DEFAULT '0',
  `admin_hold_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_listings_product_price` (`product_id`,`price`),
  KEY `ix_listings_seller` (`seller_id`),
  CONSTRAINT `fk_listings_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_listings_seller` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_listings_box` CHECK (((`box_number` is null) or ((`boxes_in_case` is not null) and (`box_number` between 1 and `boxes_in_case`)))),
  CONSTRAINT `ck_listings_price` CHECK ((`price` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `listings`
--

LOCK TABLES `listings` WRITE;
/*!40000 ALTER TABLE `listings` DISABLE KEYS */;
INSERT INTO `listings` VALUES ('00a8d481-5806-5278-b528-19de2fd98b0f','d2f16ddb-7989-59ba-bfed-d4eb1dce3d70','9572028b-c6ee-5d00-a02d-44e8969fe19c',29.99,'From Case','Box 4 of 12','Factory Sealed',5,1,'distributor','Card Depot',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('010439c8-4dde-5528-8014-13fc75865093','717ca598-619e-572a-bca2-df5d9f6f5866','86b22c36-e46a-5e1b-b6d8-af31142ff857',246.39,'Loose Product',NULL,'Factory Sealed',5,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('02c9ec76-8a29-5f11-b4a7-d7fefd231027','557ee8c6-ab03-56ee-a113-715bacb51c64','6b35ca50-4e75-5785-9a78-6c681949a28f',2051.99,'From Case','Box 5 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',5,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0a7915f4-0bd6-5854-99b1-92e5292362e7','996b13f9-196d-5c14-9f3c-9005d3a8229a','21820986-720f-54fa-9408-6319948df579',134.99,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0aec3e69-f367-5ebc-abf7-3b8c3219c409','2f32cc34-1cb9-5174-8e26-a0e9096ec8af','6b35ca50-4e75-5785-9a78-6c681949a28f',5.19,'Loose Product',NULL,'Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0afe3108-81c1-5cd8-a75b-29fa76841f64','43a35fe8-ed4f-59e8-adb1-51f55d318416','21820986-720f-54fa-9408-6319948df579',83.19,'Loose Product',NULL,'Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0ba0596b-0c11-57af-80e2-55128033ee56','5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc','86b22c36-e46a-5e1b-b6d8-af31142ff857',363.99,'Loose Product',NULL,'Factory Sealed',3,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0d1f88ed-4361-5aac-90d7-8c5165fe85e7','80f0adeb-8a0e-5974-8463-c5494b19846b','9572028b-c6ee-5d00-a02d-44e8969fe19c',124.79,'Loose Product',NULL,'Factory Sealed',3,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('0d2df9de-818c-5880-908d-4f7c34d59086','48d88a5c-2f4e-5044-93dc-c62931a2b65b','6b35ca50-4e75-5785-9a78-6c681949a28f',1049.99,'From Case',NULL,'Factory Sealed',0,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('10239622-37a4-59c7-bfc0-2755448ba8b6','d8a94f94-e090-55c3-8d44-bb0af7dc9d1c','86b22c36-e46a-5e1b-b6d8-af31142ff857',139.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('10259550-66dd-517d-9d78-b3bb299a03c2','c95198cc-1b48-5e00-9d66-926c4bc2b910','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',102.59,'From Case','Box 10 of 12','Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',10,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('13c8c786-8c78-5203-aa2d-1084810a46e9','b245eb9b-b29d-50d7-bc10-ce749d799775','86b22c36-e46a-5e1b-b6d8-af31142ff857',467.99,'Loose Product',NULL,'Factory Sealed',4,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('1e7a81a9-bba7-59bf-88f3-dcbf79b54ae7','65c9c6af-17ca-5ee8-b2f9-59c77bc167e5','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',37.79,'From Case','Box 1 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',1,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('1e98ea53-8b1d-5cc3-9a6c-16059ebabe08','717ca598-619e-572a-bca2-df5d9f6f5866','9572028b-c6ee-5d00-a02d-44e8969fe19c',237.59,'From Case','Box 11 of 12','Factory Sealed',4,1,'distributor','Card Depot',11,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('1f6ca256-bab8-5e1e-8e04-63ee29aaa6a1','d8a94f94-e090-55c3-8d44-bb0af7dc9d1c','6b35ca50-4e75-5785-9a78-6c681949a28f',151.19,'From Case','Box 4 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('219be207-5c37-5c70-a6d9-5fab0aa3fb7f','fec535d6-91bc-51d4-9721-7e2e9a363163','6b35ca50-4e75-5785-9a78-6c681949a28f',15.59,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('22fb0345-5ff9-551b-b068-da3c7c0db4a3','f2eb2be8-c1c0-54cb-970e-86040a96aca9','6b35ca50-4e75-5785-9a78-6c681949a28f',249.99,'From Case','Box 12 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',12,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('253eeb4a-58a5-5aa1-9382-c0ab1279f25c','aca47d0e-e72d-533e-9d89-a4b2f53e74fb','9572028b-c6ee-5d00-a02d-44e8969fe19c',95.19,'Loose Product',NULL,'Factory Sealed',2,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('2603b974-fabf-5512-bcda-1a0f8b2223d8','46274321-c923-5808-b017-13507710fb34','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',103.99,'Loose Product',NULL,'Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('261859b9-d384-59ad-a15b-c1e1fb540938','348ca71d-8d0a-5bd1-a5df-4bddd5d9710c','21820986-720f-54fa-9408-6319948df579',205.19,'From Case','Box 4 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('263c31af-c774-51f6-a5ce-17e44d561654','d2f16ddb-7989-59ba-bfed-d4eb1dce3d70','86b22c36-e46a-5e1b-b6d8-af31142ff857',31.19,'Loose Product',NULL,'Factory Sealed',2,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('293a64fc-e08c-5b8f-b5d7-94a7feeabdd6','f2eb2be8-c1c0-54cb-970e-86040a96aca9','86b22c36-e46a-5e1b-b6d8-af31142ff857',279.99,'Loose Product',NULL,'Factory Sealed',4,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('2c2c9288-d013-5657-bad0-bf040fe0be26','996b13f9-196d-5c14-9f3c-9005d3a8229a','9572028b-c6ee-5d00-a02d-44e8969fe19c',124.99,'From Case','Box 4 of 12','Factory Sealed',5,1,'distributor','Card Depot',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('2c43c0ae-93ad-5cc4-9d74-eeb2b62f4fbf','0c28504e-595d-557b-b56a-291db3fba54a','6b35ca50-4e75-5785-9a78-6c681949a28f',118.79,'From Case','Box 2 of 12','Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('2d3bd912-258f-5bdf-bb4c-6e2cbb2535e0','80f0adeb-8a0e-5974-8463-c5494b19846b','86b22c36-e46a-5e1b-b6d8-af31142ff857',129.59,'From Case','Box 7 of 12','Factory Sealed',4,1,'distributor','Acme Wholesale',7,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('2f84c437-520c-5e7a-a6ad-a633ea4fcfa0','557ee8c6-ab03-56ee-a113-715bacb51c64','86b22c36-e46a-5e1b-b6d8-af31142ff857',1899.99,'From Case','Box 3 of 12','Factory Sealed',4,1,'distributor','Acme Wholesale',3,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('347c3574-a155-5faa-802f-dad3b0c931fd','77b06027-5412-54be-98ab-2b0e9d478844','9572028b-c6ee-5d00-a02d-44e8969fe19c',20.79,'Loose Product',NULL,'Factory Sealed',3,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('3cdde0cb-0de3-5f9e-b240-f7318b0c6c8e','348ca71d-8d0a-5bd1-a5df-4bddd5d9710c','86b22c36-e46a-5e1b-b6d8-af31142ff857',197.59,'Loose Product',NULL,'Factory Sealed',4,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('4012d8af-a585-568a-9eb3-2277b0522dc7','5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc','6b35ca50-4e75-5785-9a78-6c681949a28f',391.99,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('426c06b6-44bc-5727-8bf4-1227d8525ae3','43a35fe8-ed4f-59e8-adb1-51f55d318416','06f484d9-2803-5261-9cac-69a1f239e7a0',81.59,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('455e5163-c632-5c5f-96e9-ebd6ed53a4b8','2f8f4838-ffa3-5907-86bd-29b5185c2624','06f484d9-2803-5261-9cac-69a1f239e7a0',305.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('481afd36-070d-5377-ac2d-4686d7b7071b','fec535d6-91bc-51d4-9721-7e2e9a363163','9572028b-c6ee-5d00-a02d-44e8969fe19c',16.79,'Loose Product',NULL,'Factory Sealed',3,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('4c8f27c6-90e8-5369-bc92-6ba755a8dc91','ccdaa9c8-2bb3-5f39-81b3-513cab1e2186','21820986-720f-54fa-9408-6319948df579',62.39,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('4cbc9914-6547-5bdb-b92f-a7c335dd22c7','557ee8c6-ab03-56ee-a113-715bacb51c64','21820986-720f-54fa-9408-6319948df579',1975.99,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('53f6ed5f-cb80-5fe1-8885-a80eb8623798','eec877d2-0845-5b0d-8d09-b84be678f314','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',74.99,'From Case','Box 8 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',8,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('552a1a29-fc80-5556-ba85-13905aa43ec7','46274321-c923-5808-b017-13507710fb34','6b35ca50-4e75-5785-9a78-6c681949a28f',99.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('5af0427c-63cc-5b4f-98d8-9ddc95bd32f8','557ee8c6-ab03-56ee-a113-715bacb51c64','06f484d9-2803-5261-9cac-69a1f239e7a0',1937.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('5e97696e-c8e7-5a9b-b84f-e32c4ba94c65','fec535d6-91bc-51d4-9721-7e2e9a363163','21820986-720f-54fa-9408-6319948df579',14.99,'From Case','Box 3 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',3,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('5f4d31d5-b588-5121-b0c9-4d0495732e38','c95198cc-1b48-5e00-9d66-926c4bc2b910','6b35ca50-4e75-5785-9a78-6c681949a28f',98.79,'Loose Product',NULL,'Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('670941b8-ca61-5f91-b93c-e65fc72a502c','348ca71d-8d0a-5bd1-a5df-4bddd5d9710c','9572028b-c6ee-5d00-a02d-44e8969fe19c',189.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Card Depot',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('685fc42f-e467-551b-b193-3d2d5e90abb6','2f32cc34-1cb9-5174-8e26-a0e9096ec8af','21820986-720f-54fa-9408-6319948df579',4.99,'From Case','Box 1 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',1,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('6cb58207-ad29-5055-8497-e2befa1ebc84','67e193b0-ddc6-5458-85d2-8557f1b2a939','86b22c36-e46a-5e1b-b6d8-af31142ff857',14.03,'From Case','Box 5 of 12','Factory Sealed',2,1,'distributor','Acme Wholesale',5,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('6ef98ffc-8396-5ad0-bf7b-5bb6df54de07','d156f901-f9ed-5452-9515-eabddaabd4fa','6b35ca50-4e75-5785-9a78-6c681949a28f',89.99,'From Case','Box 4 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('70c2f950-0452-51a4-a45e-33a196cccf83','0c28504e-595d-557b-b56a-291db3fba54a','86b22c36-e46a-5e1b-b6d8-af31142ff857',109.99,'From Case','Box 12 of 12','Factory Sealed',5,1,'distributor','Acme Wholesale',12,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('7166ee20-1fae-56da-9a42-89a204397dd2','717ca598-619e-572a-bca2-df5d9f6f5866','6b35ca50-4e75-5785-9a78-6c681949a28f',219.99,'From Case','Box 9 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',9,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('75817c45-546d-5eaf-949d-e8ae79f72d47','d8a94f94-e090-55c3-8d44-bb0af7dc9d1c','06f484d9-2803-5261-9cac-69a1f239e7a0',142.79,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('7ab27e22-336b-56a4-a534-b1de905ea7ac','622715ec-c778-5e9b-aed7-ea23cb37988b','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',4.15,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('7d5021c6-7525-5bfe-b6b2-d5c90333982f','f2eb2be8-c1c0-54cb-970e-86040a96aca9','9572028b-c6ee-5d00-a02d-44e8969fe19c',269.99,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Card Depot',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('80887157-31f2-5b0b-b4c2-6b57268f6a48','b245eb9b-b29d-50d7-bc10-ce749d799775','6b35ca50-4e75-5785-9a78-6c681949a28f',503.99,'Loose Product',NULL,'Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('821c357b-2b2b-5a40-998b-65bbdc95f3c0','77b06027-5412-54be-98ab-2b0e9d478844','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',19.99,'From Case','Box 1 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',1,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('8276e90a-d123-521a-8239-88a7711990f7','996b13f9-196d-5c14-9f3c-9005d3a8229a','06f484d9-2803-5261-9cac-69a1f239e7a0',127.99,'From Case','Box 2 of 12','Factory Sealed',5,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('89dbf812-2962-52e6-8748-f10dacba27b6','2f8f4838-ffa3-5907-86bd-29b5185c2624','86b22c36-e46a-5e1b-b6d8-af31142ff857',299.99,'From Case','Box 10 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',10,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('920fe597-90b0-54f2-bc31-0d507a13b576','43a35fe8-ed4f-59e8-adb1-51f55d318416','6b35ca50-4e75-5785-9a78-6c681949a28f',86.39,'From Case','Box 7 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',7,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('966a6f40-6311-5140-9b5d-00236aaca365','5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc','21820986-720f-54fa-9408-6319948df579',377.99,'From Case','Box 11 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',11,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('97f9ed46-9804-5231-9e3b-7f613887ac8c','fc71b1f7-fe65-5808-ac70-1a537285d40f','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',4.99,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('998b0b33-c7df-504d-817b-974882adaab4','717ca598-619e-572a-bca2-df5d9f6f5866','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',228.79,'Loose Product',NULL,'Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('99eed113-2337-5e21-b2db-6a7998b877ec','0c28504e-595d-557b-b56a-291db3fba54a','06f484d9-2803-5261-9cac-69a1f239e7a0',112.19,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('a1665ca5-a249-5c7c-87c7-646c8a06e9d7','d8a94f94-e090-55c3-8d44-bb0af7dc9d1c','21820986-720f-54fa-9408-6319948df579',145.59,'Loose Product',NULL,'Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('ac8fb3fc-d8aa-5375-b67b-c79445d49431','eec877d2-0845-5b0d-8d09-b84be678f314','9572028b-c6ee-5d00-a02d-44e8969fe19c',77.99,'Loose Product',NULL,'Factory Sealed',2,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('b204f7a4-9fe1-5144-a305-e7a9f449ed4e','67e193b0-ddc6-5458-85d2-8557f1b2a939','9572028b-c6ee-5d00-a02d-44e8969fe19c',13.51,'Loose Product',NULL,'Factory Sealed',5,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('b5e66de8-ff3c-51df-8a61-0c7cb8ea0b17','80f0adeb-8a0e-5974-8463-c5494b19846b','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',119.99,'From Case','Box 5 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',5,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('b6687b90-c441-5359-a699-c982fed7bd68','5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc','9572028b-c6ee-5d00-a02d-44e8969fe19c',349.99,'From Case','Box 9 of 12','Factory Sealed',2,1,'distributor','Card Depot',9,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('b8331215-f46a-5e70-ba1b-b25aeebe9aea','79f9fd9b-3211-5348-bd24-767441a74db6','21820986-720f-54fa-9408-6319948df579',64.79,'From Case','Box 1 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',1,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('b89a233e-7db1-5222-b7e8-92452bc3a41d','ccdaa9c8-2bb3-5f39-81b3-513cab1e2186','86b22c36-e46a-5e1b-b6d8-af31142ff857',59.99,'From Case','Box 7 of 12','Factory Sealed',4,1,'distributor','Acme Wholesale',7,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('bca7b302-b892-5a68-b4cb-d4053deb2f90','46274321-c923-5808-b017-13507710fb34','9572028b-c6ee-5d00-a02d-44e8969fe19c',107.99,'From Case','Box 4 of 12','Factory Sealed',5,1,'distributor','Card Depot',4,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('be81448d-3018-44e1-9367-23ad2785485a','b245eb9b-b29d-50d7-bc10-ce749d799775','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88',89.99,'From Case','Box 8 of 12','Factory Sealed',250,1,'manufacturer_direct','LLM inc',8,12,0,NULL,'2026-10-16 17:52:34.869','2026-10-16 18:50:31.371'),('bf539ee0-50fb-5a3a-8737-1e0993ca145a','3129ab31-af61-5822-9a6c-e8916d54e72e','9572028b-c6ee-5d00-a02d-44e8969fe19c',135.19,'Loose Product',NULL,'Factory Sealed',4,1,'distributor','Card Depot',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c026a163-97c8-58f2-86f3-edd6a7edc201','0c28504e-595d-557b-b56a-291db3fba54a','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',123.19,'Loose Product',NULL,'Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c13ab8b6-d59c-56cf-9199-d9c80ad09999','43a35fe8-ed4f-59e8-adb1-51f55d318416','86b22c36-e46a-5e1b-b6d8-af31142ff857',79.99,'From Case','Box 5 of 12','Factory Sealed',2,1,'distributor','Acme Wholesale',5,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c1f9b9c4-2fb4-5417-bfdb-7b026849557a','79f9fd9b-3211-5348-bd24-767441a74db6','9572028b-c6ee-5d00-a02d-44e8969fe19c',59.99,'From Case','Box 11 of 12','Factory Sealed',4,1,'distributor','Card Depot',11,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c29d61e8-e560-5536-a768-c806b1d9c97c','eec877d2-0845-5b0d-8d09-b84be678f314','86b22c36-e46a-5e1b-b6d8-af31142ff857',80.99,'From Case','Box 10 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',10,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c5334f43-b2ec-52f8-81fe-d006ec3bf3d1','0c28504e-595d-557b-b56a-291db3fba54a','21820986-720f-54fa-9408-6319948df579',114.39,'Loose Product',NULL,'Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c686d259-cad4-5046-893e-ad84df2c9350','c95198cc-1b48-5e00-9d66-926c4bc2b910','21820986-720f-54fa-9408-6319948df579',94.99,'From Case','Box 8 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',8,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c69d627a-0c0a-50bf-aa78-32783dc1a71b','622715ec-c778-5e9b-aed7-ea23cb37988b','6b35ca50-4e75-5785-9a78-6c681949a28f',3.99,'From Case','Box 7 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',7,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c7a7a459-9688-5436-a5d5-7ca761db9f3f','67e193b0-ddc6-5458-85d2-8557f1b2a939','21820986-720f-54fa-9408-6319948df579',14.55,'Loose Product',NULL,'Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c90db604-081e-5b91-a04d-cecaaf998a81','996b13f9-196d-5c14-9f3c-9005d3a8229a','86b22c36-e46a-5e1b-b6d8-af31142ff857',129.99,'From Case','Box 9 of 12','Factory Sealed',5,1,'distributor','Acme Wholesale',9,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('c97279cf-afe4-5b36-83a6-82547171799a','ccdaa9c8-2bb3-5f39-81b3-513cab1e2186','06f484d9-2803-5261-9cac-69a1f239e7a0',61.19,'From Case','Box 2 of 12','Factory Sealed',3,1,'distributor','Acme Wholesale',2,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('d1908670-a15b-5126-9b25-bd5ee97f1eb3','79f9fd9b-3211-5348-bd24-767441a74db6','86b22c36-e46a-5e1b-b6d8-af31142ff857',62.39,'Loose Product',NULL,'Factory Sealed',5,1,'distributor','Acme Wholesale',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('da66b767-522f-58c9-8594-bb6c6bf86d07','b245eb9b-b29d-50d7-bc10-ce749d799775','21820986-720f-54fa-9408-6319948df579',485.99,'From Case','Box 8 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',8,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('db2e26d3-afaa-5af2-bf88-ac134e20965a','f2eb2be8-c1c0-54cb-970e-86040a96aca9','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',259.99,'Loose Product',NULL,'Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('dc506460-1039-529c-8322-46483ccae18b','aca47d0e-e72d-533e-9d89-a4b2f53e74fb','21820986-720f-54fa-9408-6319948df579',84.99,'From Case','Box 6 of 12','Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',6,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('de8874bd-8182-5983-b565-00917ede78bb','67e193b0-ddc6-5458-85d2-8557f1b2a939','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',12.99,'From Case','Box 3 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',3,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('df88d938-1181-5655-928a-bed3b74fef7a','65c9c6af-17ca-5ee8-b2f9-59c77bc167e5','21820986-720f-54fa-9408-6319948df579',34.99,'From Case','Box 11 of 12','Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',11,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('e398895f-d282-5601-ad1b-a8c1a25aa4bb','aca47d0e-e72d-533e-9d89-a4b2f53e74fb','6b35ca50-4e75-5785-9a78-6c681949a28f',88.39,'Loose Product',NULL,'Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('e510ab4a-f496-5931-a700-3ce2672031b9','aca47d0e-e72d-533e-9d89-a4b2f53e74fb','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',91.79,'From Case','Box 8 of 12','Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',8,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('e63ea14c-6158-5325-9ced-449ce2ca9d54','fec535d6-91bc-51d4-9721-7e2e9a363163','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',16.19,'From Case','Box 5 of 12','Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',5,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('e7c6f742-987f-5723-bc23-3d05b14d5bcd','65c9c6af-17ca-5ee8-b2f9-59c77bc167e5','6b35ca50-4e75-5785-9a78-6c681949a28f',36.39,'Loose Product',NULL,'Factory Sealed',5,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('eee4b746-74fb-5fdd-adb9-d5b39031f578','d156f901-f9ed-5452-9515-eabddaabd4fa','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',93.59,'Loose Product',NULL,'Factory Sealed',2,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('efc87e6f-a30e-5749-9117-282c715456ee','b245eb9b-b29d-50d7-bc10-ce749d799775','9572028b-c6ee-5d00-a02d-44e8969fe19c',449.99,'From Case','Box 6 of 12','Factory Sealed',3,1,'distributor','Card Depot',6,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('f988c7eb-7d24-577f-b72a-07d1f1e8a0c6','557ee8c6-ab03-56ee-a113-715bacb51c64','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',2127.99,'Loose Product',NULL,'Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('fa4e525e-9901-5e46-9095-9e506682d2dd','2f8f4838-ffa3-5907-86bd-29b5185c2624','21820986-720f-54fa-9408-6319948df579',311.99,'Loose Product',NULL,'Factory Sealed',4,1,'manufacturer_direct','Manufacturer Direct',NULL,NULL,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537'),('fbd2bd6d-9662-50fc-9133-2d4bbde2ad83','3129ab31-af61-5822-9a6c-e8916d54e72e','0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd',129.99,'From Case','Box 10 of 12','Factory Sealed',3,1,'manufacturer_direct','Manufacturer Direct',10,12,0,NULL,'2026-09-24 12:00:00.000','2026-10-16 17:34:54.537');
/*!40000 ALTER TABLE `listings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prt_token_hash` (`token_hash`),
  KEY `ix_prt_user` (`user_id`),
  CONSTRAINT `fk_prt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
INSERT INTO `password_reset_tokens` VALUES ('56023f14-e5c6-4af9-ad07-7fe06629ba1e','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','98d3bf67b01c590cf1e38e2b826a3577f08128bdbe5a78842dbef59a865e9050','2026-10-16 03:39:06.648',NULL,'2026-10-16 02:39:06.648');
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payouts`
--

DROP TABLE IF EXISTS `payouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payouts` (
  `id` char(36) NOT NULL,
  `seller_id` char(36) NOT NULL,
  `amount_cents` int unsigned NOT NULL,
  `earnings_count` int unsigned NOT NULL,
  `status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  `reference` varchar(120) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by_staff_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paid_at` datetime(3) DEFAULT NULL,
  `paid_by_staff_id` char(36) DEFAULT NULL,
  `cancelled_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_payouts_seller` (`seller_id`,`created_at`),
  KEY `ix_payouts_status` (`status`),
  KEY `fk_payouts_creator` (`created_by_staff_id`),
  KEY `fk_payouts_payer` (`paid_by_staff_id`),
  CONSTRAINT `fk_payouts_creator` FOREIGN KEY (`created_by_staff_id`) REFERENCES `admin_staff` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payouts_payer` FOREIGN KEY (`paid_by_staff_id`) REFERENCES `admin_staff` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payouts_seller` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payouts`
--

LOCK TABLES `payouts` WRITE;
/*!40000 ALTER TABLE `payouts` DISABLE KEYS */;
INSERT INTO `payouts` VALUES ('a0b10001-0000-4000-8000-000000000001','06f484d9-2803-5261-9cac-69a1f239e7a0',24248,1,'paid','DEMO-ACH-1001','Demo payout','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','2026-09-30 15:00:00.000','2026-10-01 14:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL),('a0b10001-0000-4000-8000-000000000002','06f484d9-2803-5261-9cac-69a1f239e7a0',15519,1,'pending',NULL,'Demo pending','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','2026-10-12 15:00:00.000',NULL,NULL,NULL);
/*!40000 ALTER TABLE `payouts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_images`
--

DROP TABLE IF EXISTS `product_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_images` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `slot` tinyint unsigned NOT NULL,
  `image_key` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_images_slot` (`product_id`,`slot`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_product_images_slot` CHECK ((`slot` between 1 and 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_images`
--

LOCK TABLES `product_images` WRITE;
/*!40000 ALTER TABLE `product_images` DISABLE KEYS */;
INSERT INTO `product_images` VALUES ('00248a80-02ff-59e5-a2d2-5f050e8d8f59','43a35fe8-ed4f-59e8-adb1-51f55d318416',1,'products/43a35fe8-ed4f-59e8-adb1-51f55d318416/54c5dc93-086f-44ad-b2a7-5e5a40c0d417.jpg'),('10acfc77-89c3-55a8-b31b-f67a63d76a88','717ca598-619e-572a-bca2-df5d9f6f5866',1,'products/717ca598-619e-572a-bca2-df5d9f6f5866/3937ff68-8a79-48d2-8541-72f1041461a1.jpg'),('11e7051d-cbc3-5d10-be4e-522da33957f0','2f32cc34-1cb9-5174-8e26-a0e9096ec8af',1,'products/2f32cc34-1cb9-5174-8e26-a0e9096ec8af/84ed1316-04e1-444b-8acd-858ed67c887c.jpg'),('1734e21d-d0dd-532c-a898-48f34abb2779','fc71b1f7-fe65-5808-ac70-1a537285d40f',1,'products/fc71b1f7-fe65-5808-ac70-1a537285d40f/c57a7607-0a26-46b7-8a34-c68a2a222f5b.jpg'),('210edff7-5d5b-5bb9-974e-d84e979bccb4','79f9fd9b-3211-5348-bd24-767441a74db6',1,'products/79f9fd9b-3211-5348-bd24-767441a74db6/00a81180-cea0-40c6-8647-dc91f6346a85.jpg'),('42e17d66-b099-4530-9898-8fdbbc6b0c15','9f078ba5-9e41-4f43-9b5a-f46cd297c473',2,'products/9f078ba5-9e41-4f43-9b5a-f46cd297c473/454f429d-31d5-43c2-98fb-abf9849f837f.jpg'),('4f22eaf8-af19-568e-9dae-52233970f42e','d156f901-f9ed-5452-9515-eabddaabd4fa',1,'products/d156f901-f9ed-5452-9515-eabddaabd4fa/94767b7b-55de-4012-a838-91d74c6c57ac.jpg'),('652d2bc7-cc56-558d-9351-6dc7715caa2e','f2eb2be8-c1c0-54cb-970e-86040a96aca9',1,'products/f2eb2be8-c1c0-54cb-970e-86040a96aca9/5f91d230-a86d-4b06-9c54-5566e7bd5a0b.jpg'),('666000f2-ed8e-595b-9873-aada238f33a4','c95198cc-1b48-5e00-9d66-926c4bc2b910',1,'products/c95198cc-1b48-5e00-9d66-926c4bc2b910/aba55d34-a070-4499-80cb-22d15661b4b9.jpg'),('6a2d8a2b-9356-5dde-a83d-444c858214c5','aca47d0e-e72d-533e-9d89-a4b2f53e74fb',1,'products/aca47d0e-e72d-533e-9d89-a4b2f53e74fb/91d20826-9c03-46f9-b9c2-81f7f5977cde.jpg'),('6a341495-07bb-5cc5-b9be-c208784476b4','d2f16ddb-7989-59ba-bfed-d4eb1dce3d70',1,'products/d2f16ddb-7989-59ba-bfed-d4eb1dce3d70/9c33e119-a9b7-4709-be49-7798f44f8187.jpg'),('73734848-3ba7-5c06-9e35-5167cd7c9886','5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc',1,'products/5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc/487ad704-a3af-46e0-b3f4-398bab2432f8.jpg'),('77a66849-55b5-5c8c-932b-ba852a334c9b','eec877d2-0845-5b0d-8d09-b84be678f314',1,'products/eec877d2-0845-5b0d-8d09-b84be678f314/90de18e4-13b2-49b1-b31b-adccbc106de4.jpg'),('77ddac1a-9aef-55d9-95b3-d26d16411268','557ee8c6-ab03-56ee-a113-715bacb51c64',1,'products/557ee8c6-ab03-56ee-a113-715bacb51c64/f0099cbc-2701-4022-85c9-daa2014fe67c.jpg'),('8205800d-d6b2-514e-978e-0e0d3c0e8dbe','67e193b0-ddc6-5458-85d2-8557f1b2a939',1,'products/67e193b0-ddc6-5458-85d2-8557f1b2a939/845e554b-52a8-4e65-a284-1db6ac813917.jpg'),('86c32333-ec3e-5aec-8ed2-9ebd25d2d117','2f8f4838-ffa3-5907-86bd-29b5185c2624',1,'products/2f8f4838-ffa3-5907-86bd-29b5185c2624/ecc1e31c-86da-4dae-aeaf-c31ae39ad663.jpg'),('8e9c21dd-bd9e-4177-b1f3-3031d251e303','9f078ba5-9e41-4f43-9b5a-f46cd297c473',1,'products/9f078ba5-9e41-4f43-9b5a-f46cd297c473/043b24b3-6bae-42ed-b010-7e801a3d15ed.jpg'),('9687e3f0-9181-583a-b62c-2ae270e7b07b','996b13f9-196d-5c14-9f3c-9005d3a8229a',1,'products/996b13f9-196d-5c14-9f3c-9005d3a8229a/f62752b4-4373-4781-ab3b-42114fbfc306.jpg'),('993cf9d6-e95f-50f5-bf33-09cb50ddc737','ccdaa9c8-2bb3-5f39-81b3-513cab1e2186',1,'products/ccdaa9c8-2bb3-5f39-81b3-513cab1e2186/7ee316ea-8c73-4a23-93b1-bb97a2844bc3.jpg'),('9dfba1ff-019f-5f0a-9b94-0b4490a4a6af','996b13f9-196d-5c14-9f3c-9005d3a8229a',2,'products/996b13f9-196d-5c14-9f3c-9005d3a8229a/d5110e01-2818-4299-900d-dac711abeacd.jpg'),('9e13ffcb-6836-5c34-adef-70ae8427c086','48d88a5c-2f4e-5044-93dc-c62931a2b65b',1,'products/48d88a5c-2f4e-5044-93dc-c62931a2b65b/f555487b-5e9b-4efe-a439-6b9bbee753b6.jpg'),('a0a8510f-b09f-58df-924e-fd600541458f','0c28504e-595d-557b-b56a-291db3fba54a',1,'products/0c28504e-595d-557b-b56a-291db3fba54a/9cdbacb3-0ec5-41a0-b9cd-e05a88ea5593.jpg'),('aa44f4a8-47f8-5dc4-908e-5da4d314986f','fec535d6-91bc-51d4-9721-7e2e9a363163',1,'products/fec535d6-91bc-51d4-9721-7e2e9a363163/b927c229-d622-459a-86c4-a17d98314774.jpg'),('ab51501d-7f16-5f6e-b046-c55cbc3f8924','65c9c6af-17ca-5ee8-b2f9-59c77bc167e5',1,'products/65c9c6af-17ca-5ee8-b2f9-59c77bc167e5/2e2187ad-d618-4e35-9e3f-1fae2d67750a.jpg'),('ae7603ba-dba7-4019-8868-befdc7dd8002','9f078ba5-9e41-4f43-9b5a-f46cd297c473',3,'products/9f078ba5-9e41-4f43-9b5a-f46cd297c473/c796f8d3-53b2-4e20-89ad-dfc095be8fa6.jpg'),('bc5e806b-8201-5bbb-ac6e-4912ba1880c9','b245eb9b-b29d-50d7-bc10-ce749d799775',1,'products/b245eb9b-b29d-50d7-bc10-ce749d799775/e73a2477-9057-4a77-845c-3a5ab34d8a0f.jpg'),('c404d710-9b1f-5491-99bd-f3cac9432a66','622715ec-c778-5e9b-aed7-ea23cb37988b',1,'products/622715ec-c778-5e9b-aed7-ea23cb37988b/9ebbca1b-74b5-47c9-8838-0e7634fef77c.jpg'),('c53ccb8b-99b2-5592-b6c6-de93d8d83524','348ca71d-8d0a-5bd1-a5df-4bddd5d9710c',1,'products/348ca71d-8d0a-5bd1-a5df-4bddd5d9710c/0f986b4d-907c-4f36-b774-cd627635a87a.jpg'),('cc671943-bef0-5a1f-8fdf-f0eaf61403db','77b06027-5412-54be-98ab-2b0e9d478844',1,'products/77b06027-5412-54be-98ab-2b0e9d478844/badb13c6-c7d6-4d31-a79c-525ebf450fbe.jpg'),('d15c4a2a-75bf-5fd6-aeec-6b63e6f4538e','46274321-c923-5808-b017-13507710fb34',1,'products/46274321-c923-5808-b017-13507710fb34/e2b6a6d3-e2b7-4f0e-8bf8-8a8e52cb708b.jpg'),('db807aa0-2b2a-5508-87d1-79e9ede4e4ac','3129ab31-af61-5822-9a6c-e8916d54e72e',1,'products/3129ab31-af61-5822-9a6c-e8916d54e72e/67b1d48d-f6c3-4095-8088-233a736f9d3a.jpg'),('e60fa2a8-3328-5339-b4bf-bebb175257dc','d8a94f94-e090-55c3-8d44-bb0af7dc9d1c',1,'products/d8a94f94-e090-55c3-8d44-bb0af7dc9d1c/001142a6-7f90-4959-994d-2a38aeef87b6.jpg'),('ea6c7051-f016-55ec-b015-6a84264fb05e','80f0adeb-8a0e-5974-8463-c5494b19846b',1,'products/80f0adeb-8a0e-5974-8463-c5494b19846b/2b36b5e9-2700-42e7-a6be-f8cad596c70b.jpg');
/*!40000 ALTER TABLE `product_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_types`
--

DROP TABLE IF EXISTS `product_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_types` (
  `id` char(36) NOT NULL,
  `name` varchar(60) NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_types_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_types`
--

LOCK TABLES `product_types` WRITE;
/*!40000 ALTER TABLE `product_types` DISABLE KEYS */;
INSERT INTO `product_types` VALUES ('28051eee-4f5d-50bc-a4f0-a4acd49310e3','Illustration Boxes',4),('b1518d2f-3757-5e72-b641-a2a663cea427','Sealed Cases',0),('b9b5d97a-2f49-5b79-a14c-24848574c9b4','Booster Boxes',1),('de421a5d-a28b-5d33-8480-99a872c2a7a1','Single Packs',3),('f51d59a1-1347-55ad-8d75-52163b01eee2','Other',5),('fc97eff8-b472-5cc9-988c-e8bd31392e9f','Blisters',2);
/*!40000 ALTER TABLE `product_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` char(36) NOT NULL,
  `brand_id` char(36) NOT NULL,
  `product_type_id` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text,
  `thumbnail_key` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_brand_name` (`brand_id`,`name`),
  KEY `ix_products_type` (`product_type_id`),
  CONSTRAINT `fk_products_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_products_type` FOREIGN KEY (`product_type_id`) REFERENCES `product_types` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES ('0c28504e-595d-557b-b56a-291db3fba54a','21958bee-344a-5685-a8a4-a7bdb8048545','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Unlimited Booster Box','Unlimited Booster Box from Star Wars. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/0c28504e-595d-557b-b56a-291db3fba54a/9cdbacb3-0ec5-41a0-b9cd-e05a88ea5593.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.384'),('2f32cc34-1cb9-5174-8e26-a0e9096ec8af','21958bee-344a-5685-a8a4-a7bdb8048545','de421a5d-a28b-5d33-8480-99a872c2a7a1','Spark Pack','Spark Pack from Star Wars. A single factory-sealed booster pack. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/2f32cc34-1cb9-5174-8e26-a0e9096ec8af/84ed1316-04e1-444b-8acd-858ed67c887c.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.415'),('2f8f4838-ffa3-5907-86bd-29b5185c2624','512f9f72-4593-5244-8cfc-acc56270cebc','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Prizm Hobby Box','Prizm Hobby Box from Panini. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/2f8f4838-ffa3-5907-86bd-29b5185c2624/ecc1e31c-86da-4dae-aeaf-c31ae39ad663.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.385'),('3129ab31-af61-5822-9a6c-e8916d54e72e','78af87c2-f95f-5f0a-bad9-1496737cadf2','b9b5d97a-2f49-5b79-a14c-24848574c9b4','First Chapter Booster Box','First Chapter Booster Box from Lorcana. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/3129ab31-af61-5822-9a6c-e8916d54e72e/67b1d48d-f6c3-4095-8088-233a736f9d3a.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.386'),('348ca71d-8d0a-5bd1-a5df-4bddd5d9710c','9afac02e-7131-55a7-b4a7-ebc63f832992','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Series 1 Hobby Box','Series 1 Hobby Box from Upper Deck. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/348ca71d-8d0a-5bd1-a5df-4bddd5d9710c/0f986b4d-907c-4f36-b774-cd627635a87a.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.388'),('43a35fe8-ed4f-59e8-adb1-51f55d318416','ea877f02-22ee-5be4-873f-801c7d05b669','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Union Booster Box','Union Booster Box from Union Arena. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/43a35fe8-ed4f-59e8-adb1-51f55d318416/54c5dc93-086f-44ad-b2a7-5e5a40c0d417.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.390'),('46274321-c923-5808-b017-13507710fb34','fcf04e37-aaad-5629-9ecb-a93377ccc504','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Origins Booster Box','Origins Booster Box from Rift Bound. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/46274321-c923-5808-b017-13507710fb34/e2b6a6d3-e2b7-4f0e-8bf8-8a8e52cb708b.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.391'),('48d88a5c-2f4e-5044-93dc-c62931a2b65b','0c39ecde-0704-55f2-b07c-ea58a20020eb','b1518d2f-3757-5e72-b641-a2a663cea427','Elite Series','Elite Series from Magic. A factory-sealed case, just as it left the manufacturer. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/48d88a5c-2f4e-5044-93dc-c62931a2b65b/f555487b-5e9b-4efe-a439-6b9bbee753b6.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.409'),('557ee8c6-ab03-56ee-a113-715bacb51c64','9afac02e-7131-55a7-b4a7-ebc63f832992','b1518d2f-3757-5e72-b641-a2a663cea427','Young Guns Case','Young Guns Case from Upper Deck. A factory-sealed case, just as it left the manufacturer. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/557ee8c6-ab03-56ee-a113-715bacb51c64/f0099cbc-2701-4022-85c9-daa2014fe67c.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.410'),('5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc','a3131442-b8ea-5e6c-ae7e-91729d2ab046','b1518d2f-3757-5e72-b641-a2a663cea427','Awakened Case','Awakened Case from Dragon Ball. A factory-sealed case, just as it left the manufacturer. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/5d3804ab-3f5f-52ef-b8d8-2a62db08e4dc/487ad704-a3af-46e0-b3f4-398bab2432f8.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.411'),('622715ec-c778-5e9b-aed7-ea23cb37988b','d4770918-bc8a-5e85-af81-2bdc4fd4fc23','de421a5d-a28b-5d33-8480-99a872c2a7a1','Hidden Leaf Pack','Hidden Leaf Pack from Naruto. A single factory-sealed booster pack. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/622715ec-c778-5e9b-aed7-ea23cb37988b/9ebbca1b-74b5-47c9-8838-0e7634fef77c.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.416'),('65c9c6af-17ca-5ee8-b2f9-59c77bc167e5','512f9f72-4593-5244-8cfc-acc56270cebc','fc97eff8-b472-5cc9-988c-e8bd31392e9f','Donruss Blaster','Donruss Blaster from Panini. A factory-sealed blister pack with bonus contents. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/65c9c6af-17ca-5ee8-b2f9-59c77bc167e5/2e2187ad-d618-4e35-9e3f-1fae2d67750a.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.378'),('67e193b0-ddc6-5458-85d2-8557f1b2a939','fcf04e37-aaad-5629-9ecb-a93377ccc504','fc97eff8-b472-5cc9-988c-e8bd31392e9f','Rift Blister','Rift Blister from Rift Bound. A factory-sealed blister pack with bonus contents. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/67e193b0-ddc6-5458-85d2-8557f1b2a939/845e554b-52a8-4e65-a284-1db6ac813917.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.379'),('717ca598-619e-572a-bca2-df5d9f6f5866','c4b635d5-8a31-5f95-9670-ead28aba9774','b1518d2f-3757-5e72-b641-a2a663cea427','Starter Deck Case','Starter Deck Case from One Piece. A factory-sealed case, just as it left the manufacturer. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/717ca598-619e-572a-bca2-df5d9f6f5866/3937ff68-8a79-48d2-8541-72f1041461a1.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.412'),('77b06027-5412-54be-98ab-2b0e9d478844','a15d4546-f55f-5a1e-8fac-df2b1fe9e37d','fc97eff8-b472-5cc9-988c-e8bd31392e9f','Series 1 Hanger','Series 1 Hanger from Topps. A factory-sealed blister pack with bonus contents. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/77b06027-5412-54be-98ab-2b0e9d478844/badb13c6-c7d6-4d31-a79c-525ebf450fbe.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.381'),('79f9fd9b-3211-5348-bd24-767441a74db6','78af87c2-f95f-5f0a-bad9-1496737cadf2','28051eee-4f5d-50bc-a4f0-a4acd49310e3','Illumineer Trove','Illumineer Trove from Lorcana. A factory-sealed illustration box with collector extras. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/79f9fd9b-3211-5348-bd24-767441a74db6/00a81180-cea0-40c6-8647-dc91f6346a85.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.402'),('80f0adeb-8a0e-5974-8463-c5494b19846b','0c39ecde-0704-55f2-b07c-ea58a20020eb','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Draft Booster Box','Draft Booster Box from Magic. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/80f0adeb-8a0e-5974-8463-c5494b19846b/2b36b5e9-2700-42e7-a6be-f8cad596c70b.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.392'),('996b13f9-196d-5c14-9f3c-9005d3a8229a','d9fdef7c-b4be-5c6d-9e37-4871e216195f','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Collector Set Alpha','Collector Set Alpha from Pokémon. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/996b13f9-196d-5c14-9f3c-9005d3a8229a/f62752b4-4373-4781-ab3b-42114fbfc306.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.394'),('9f078ba5-9e41-4f43-9b5a-f46cd297c473','c4b635d5-8a31-5f95-9670-ead28aba9774','b1518d2f-3757-5e72-b641-a2a663cea427','OP 17 The worlds strongest warriers','testasdfadsf yes','products/9f078ba5-9e41-4f43-9b5a-f46cd297c473/043b24b3-6bae-42ed-b010-7e801a3d15ed.jpg',1,'2026-10-16 18:40:19.506','2026-10-16 18:40:52.403'),('aca47d0e-e72d-533e-9d89-a4b2f53e74fb','d4770918-bc8a-5e85-af81-2bdc4fd4fc23','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Ninja Legacy Booster Box','Ninja Legacy Booster Box from Naruto. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/aca47d0e-e72d-533e-9d89-a4b2f53e74fb/91d20826-9c03-46f9-b9c2-81f7f5977cde.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.395'),('b245eb9b-b29d-50d7-bc10-ce749d799775','0c39ecde-0704-55f2-b07c-ea58a20020eb','b1518d2f-3757-5e72-b641-a2a663cea427','Commander Deck Case','Commander Deck Case from Magic. A factory-sealed case, just as it left the manufacturer. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/b245eb9b-b29d-50d7-bc10-ce749d799775/e73a2477-9057-4a77-845c-3a5ab34d8a0f.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.413'),('c95198cc-1b48-5e00-9d66-926c4bc2b910','c4b635d5-8a31-5f95-9670-ead28aba9774','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Romance Dawn Booster Box','Romance Dawn Booster Box from One Piece. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/c95198cc-1b48-5e00-9d66-926c4bc2b910/aba55d34-a070-4499-80cb-22d15661b4b9.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.397'),('ccdaa9c8-2bb3-5f39-81b3-513cab1e2186','0c39ecde-0704-55f2-b07c-ea58a20020eb','f51d59a1-1347-55ad-8d75-52163b01eee2','Bundle Gift Edition','Bundle Gift Edition from Magic. A factory-sealed collectible product. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/ccdaa9c8-2bb3-5f39-81b3-513cab1e2186/7ee316ea-8c73-4a23-93b1-bb97a2844bc3.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.405'),('d156f901-f9ed-5452-9515-eabddaabd4fa','d9fdef7c-b4be-5c6d-9e37-4871e216195f','28051eee-4f5d-50bc-a4f0-a4acd49310e3','Prism Illustration Box','Prism Illustration Box from Pokémon. A factory-sealed illustration box with collector extras. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/d156f901-f9ed-5452-9515-eabddaabd4fa/94767b7b-55de-4012-a838-91d74c6c57ac.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.403'),('d2f16ddb-7989-59ba-bfed-d4eb1dce3d70','ea877f02-22ee-5be4-873f-801c7d05b669','f51d59a1-1347-55ad-8d75-52163b01eee2','Starter Deck Set','Starter Deck Set from Union Arena. A factory-sealed collectible product. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/d2f16ddb-7989-59ba-bfed-d4eb1dce3d70/9c33e119-a9b7-4709-be49-7798f44f8187.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.407'),('d8a94f94-e090-55c3-8d44-bb0af7dc9d1c','d9fdef7c-b4be-5c6d-9e37-4871e216195f','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Crimson Storm Booster Box','Crimson Storm Booster Box from Pokémon. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/d8a94f94-e090-55c3-8d44-bb0af7dc9d1c/001142a6-7f90-4959-994d-2a38aeef87b6.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.398'),('eec877d2-0845-5b0d-8d09-b84be678f314','a3131442-b8ea-5e6c-ae7e-91729d2ab046','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Fusion World Booster Box','Fusion World Booster Box from Dragon Ball. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/eec877d2-0845-5b0d-8d09-b84be678f314/90de18e4-13b2-49b1-b31b-adccbc106de4.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.399'),('f2eb2be8-c1c0-54cb-970e-86040a96aca9','a15d4546-f55f-5a1e-8fac-df2b1fe9e37d','b9b5d97a-2f49-5b79-a14c-24848574c9b4','Chrome Hobby Box','Chrome Hobby Box from Topps. A factory-sealed booster display box. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/f2eb2be8-c1c0-54cb-970e-86040a96aca9/5f91d230-a86d-4b06-9c54-5566e7bd5a0b.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.401'),('fc71b1f7-fe65-5808-ac70-1a537285d40f','c4b635d5-8a31-5f95-9670-ead28aba9774','de421a5d-a28b-5d33-8480-99a872c2a7a1','Standard Pack','Standard Pack from One Piece. A single factory-sealed booster pack. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/fc71b1f7-fe65-5808-ac70-1a537285d40f/c57a7607-0a26-46b7-8a34-c68a2a222f5b.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.417'),('fec535d6-91bc-51d4-9721-7e2e9a363163','d9fdef7c-b4be-5c6d-9e37-4871e216195f','fc97eff8-b472-5cc9-988c-e8bd31392e9f','Mega Evolution Blister','Mega Evolution Blister from Pokémon. A factory-sealed blister pack with bonus contents. Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.','products/fec535d6-91bc-51d4-9721-7e2e9a363163/b927c229-d622-459a-86c4-a17d98314774.jpg',1,'2026-09-24 12:00:00.000','2026-10-16 17:34:55.382');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_application_documents`
--

DROP TABLE IF EXISTS `seller_application_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_application_documents` (
  `id` char(36) NOT NULL,
  `application_id` char(36) NOT NULL,
  `doc_type` enum('city_permit','business_license','tax_permit','other') NOT NULL DEFAULT 'other',
  `original_filename` varchar(255) NOT NULL,
  `storage_key` varchar(500) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` int unsigned NOT NULL,
  `uploaded_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_sellerdoc_app` (`application_id`),
  CONSTRAINT `fk_sellerdoc_app` FOREIGN KEY (`application_id`) REFERENCES `seller_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_application_documents`
--

LOCK TABLES `seller_application_documents` WRITE;
/*!40000 ALTER TABLE `seller_application_documents` DISABLE KEYS */;
INSERT INTO `seller_application_documents` VALUES ('551bbc24-b1db-522d-84c6-f1be7f9a6404','6e837edc-1fa2-5ff2-a1d9-af80924eecab','city_permit','city_selling_permit.pdf','seller-docs/6e837edc-1fa2-5ff2-a1d9-af80924eecab/city_selling_permit.pdf','application/pdf',182400,'2026-10-16 00:26:23.919'),('714b566e-29a4-4f43-ac9f-2e67f3c3703f','e581ca3c-ece0-46c2-ab7e-97ec61f3412b','other','IMG_3689.HEIC','seller-applications/e581ca3c-ece0-46c2-ab7e-97ec61f3412b/aa4e714f-10a4-43cf-a638-af8ac787be2e.heic','image/heic',2864477,'2026-10-16 18:34:00.769'),('7e432645-bc70-42a6-80ae-2d94a894633f','4c442182-b736-4903-a77d-815ed7c22b1a','other','IMG_3685.HEIC','seller-applications/4c442182-b736-4903-a77d-815ed7c22b1a/ba47915f-8c92-4da5-b9e0-64a435408e40.heic','image/heic',2753292,'2026-10-16 02:32:35.040'),('b2399b5c-690f-48d5-9e8c-23a9c58f627c','e581ca3c-ece0-46c2-ab7e-97ec61f3412b','other','IMG_3688.HEIC','seller-applications/e581ca3c-ece0-46c2-ab7e-97ec61f3412b/420a64b1-e696-40ed-b84a-8e378e56bde0.heic','image/heic',2808341,'2026-10-16 18:34:00.771'),('b954ed2c-e943-421f-9e39-f62726484026','e7e89716-f6e7-43aa-9dfa-e16e6f3c2023','other','IMG_3688.HEIC','seller-applications/e7e89716-f6e7-43aa-9dfa-e16e6f3c2023/bd9a4717-f832-4cc5-9a07-5e021acccca5.heic','image/heic',2808341,'2026-10-16 18:37:24.558'),('c81f2ad5-5b4f-4fcc-aef4-d86ff93c1d3c','e7e89716-f6e7-43aa-9dfa-e16e6f3c2023','other','IMG_3691.HEIC','seller-applications/e7e89716-f6e7-43aa-9dfa-e16e6f3c2023/83337865-cc52-4421-948a-c25865226aea.heic','image/heic',2510583,'2026-10-16 18:37:24.559'),('e76c9bac-fc8b-53ff-a1fa-47ec8963912c','6e837edc-1fa2-5ff2-a1d9-af80924eecab','tax_permit','tx_sales_tax_permit.jpg','seller-docs/6e837edc-1fa2-5ff2-a1d9-af80924eecab/tx_sales_tax_permit.jpg','image/jpeg',640512,'2026-10-16 00:26:23.919'),('fc6d8174-0ab1-43d0-97b4-29f7ea8352c3','e581ca3c-ece0-46c2-ab7e-97ec61f3412b','other','IMG_3690.HEIC','seller-applications/e581ca3c-ece0-46c2-ab7e-97ec61f3412b/5e345854-e128-4c27-b5d7-37402ecb55c0.heic','image/heic',2449349,'2026-10-16 18:34:00.770');
/*!40000 ALTER TABLE `seller_application_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_applications`
--

DROP TABLE IF EXISTS `seller_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_applications` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `business_name` varchar(160) NOT NULL,
  `business_address` varchar(255) NOT NULL,
  `contact_email` varchar(255) NOT NULL,
  `phone_number` varchar(30) DEFAULT NULL,
  `source_type` enum('distributor','retail_store','manufacturer_direct','other','test') NOT NULL,
  `distributor_list` text NOT NULL,
  `status` enum('submitted','under_review','approved','declined') NOT NULL DEFAULT 'submitted',
  `is_test` tinyint(1) NOT NULL DEFAULT '0',
  `decision_note` varchar(500) DEFAULT NULL,
  `reviewed_by_staff_id` char(36) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `submitted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `open_for_user_id` char(36) GENERATED ALWAYS AS ((case when (`status` in (_utf8mb4'submitted',_utf8mb4'under_review')) then `user_id` else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_one_open_application` (`open_for_user_id`),
  KEY `ix_sellerapp_status` (`status`,`submitted_at`),
  KEY `ix_sellerapp_user` (`user_id`),
  KEY `fk_sellerapp_staff` (`reviewed_by_staff_id`),
  CONSTRAINT `fk_sellerapp_staff` FOREIGN KEY (`reviewed_by_staff_id`) REFERENCES `admin_staff` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sellerapp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_applications`
--

LOCK TABLES `seller_applications` WRITE;
/*!40000 ALTER TABLE `seller_applications` DISABLE KEYS */;
INSERT INTO `seller_applications` (`id`, `user_id`, `business_name`, `business_address`, `contact_email`, `phone_number`, `source_type`, `distributor_list`, `status`, `is_test`, `decision_note`, `reviewed_by_staff_id`, `reviewed_at`, `submitted_at`, `updated_at`) VALUES ('4c442182-b736-4903-a77d-815ed7c22b1a','4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','Test','22 test rd','test@drybs.com','2424242424','test','Test','approved',1,'Approved automatically: a test application on a development server.',NULL,'2026-10-16 02:32:35.040','2026-10-16 02:32:35.040','2026-10-16 02:32:35.051'),('6e837edc-1fa2-5ff2-a1d9-af80924eecab','d8c564db-8d2a-58e2-b0e5-5ca29e0c796f','Lone Star Cards LLC','200 Congress Ave, Austin, TX 78701','applicant@tsm.test','555-0142','distributor','Southeast Card Distribution, Pacific Hobby Wholesale','submitted',0,NULL,NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.917'),('8af153e6-0f77-5236-b6ba-c5426f8f9ccc','06f484d9-2803-5261-9cac-69a1f239e7a0','Demo Seller Trading Co. (test)','1 Test Street, Austin, TX 78701','seller@tsm.test','555-0100','test','Test Distributor, Local Game Store','approved',1,'Auto-approved test application','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','2026-09-24 12:00:00.000','2026-09-24 12:00:00.000','2026-10-16 00:26:23.917'),('e581ca3c-ece0-46c2-ab7e-97ec61f3412b','0ab81975-02bb-4f67-b04f-64ee89cfcd64','Test 1','Test 1','test+1@test.com','1234567890','retail_store','Test one','declined',0,'No Reason Test','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','2026-10-16 18:35:39.944','2026-10-16 18:34:00.769','2026-10-16 18:35:39.944'),('e7e89716-f6e7-43aa-9dfa-e16e6f3c2023','0ab81975-02bb-4f67-b04f-64ee89cfcd64','Test1','Test rd','test@tets.com','21212121211','distributor','Ddd','approved',0,NULL,'5dc1081f-e6c8-5ff5-abbe-342f880dcc8c','2026-10-16 18:37:39.509','2026-10-16 18:37:24.558','2026-10-16 18:37:39.510');
/*!40000 ALTER TABLE `seller_applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_earnings`
--

DROP TABLE IF EXISTS `seller_earnings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_earnings` (
  `id` char(36) NOT NULL,
  `seller_id` char(36) NOT NULL,
  `listing_id` char(36) DEFAULT NULL,
  `product_name` varchar(160) NOT NULL,
  `order_ref` varchar(60) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `unit_price_cents` int unsigned NOT NULL,
  `gross_cents` int unsigned NOT NULL,
  `commission_bps` smallint unsigned NOT NULL,
  `commission_cents` int unsigned NOT NULL,
  `net_cents` int unsigned NOT NULL,
  `status` enum('available','in_payout','paid','reversed') NOT NULL DEFAULT 'available',
  `payout_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_earnings_seller` (`seller_id`,`status`),
  KEY `ix_earnings_payout` (`payout_id`),
  KEY `fk_earnings_listing` (`listing_id`),
  CONSTRAINT `fk_earnings_listing` FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_earnings_payout` FOREIGN KEY (`payout_id`) REFERENCES `payouts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_earnings_seller` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_earnings`
--

LOCK TABLES `seller_earnings` WRITE;
/*!40000 ALTER TABLE `seller_earnings` DISABLE KEYS */;
INSERT INTO `seller_earnings` VALUES ('e0a10001-0000-4000-8000-000000000001','06f484d9-2803-5261-9cac-69a1f239e7a0',NULL,'Collector Set Alpha','ORD-30001',2,12499,24998,300,750,24248,'paid','a0b10001-0000-4000-8000-000000000001','2026-09-26 18:20:00.000'),('e0a10001-0000-4000-8000-000000000002','06f484d9-2803-5261-9cac-69a1f239e7a0',NULL,'Crimson Storm Booster Box','ORD-30007',1,14999,14999,300,450,14549,'available',NULL,'2026-10-08 16:05:00.000'),('e0a10001-0000-4000-8000-000000000003','06f484d9-2803-5261-9cac-69a1f239e7a0',NULL,'Standard Pack','ORD-30012',3,499,1497,300,45,1452,'available',NULL,'2026-10-09 11:40:00.000'),('e0a10001-0000-4000-8000-000000000004','06f484d9-2803-5261-9cac-69a1f239e7a0',NULL,'Mega Evolution Blister','ORD-30015',1,15999,15999,300,480,15519,'in_payout','a0b10001-0000-4000-8000-000000000002','2026-10-11 20:15:00.000'),('e0a10001-0000-4000-8000-000000000005','6b35ca50-4e75-5785-9a78-6c681949a28f',NULL,'Collector Set Alpha','ORD-30003',1,13499,13499,300,405,13094,'available',NULL,'2026-10-02 13:30:00.000'),('e0a10001-0000-4000-8000-000000000006','86b22c36-e46a-5e1b-b6d8-af31142ff857',NULL,'Crimson Storm Booster Box','ORD-30009',2,13999,27998,300,840,27158,'available',NULL,'2026-10-10 09:10:00.000');
/*!40000 ALTER TABLE `seller_earnings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_profiles`
--

DROP TABLE IF EXISTS `seller_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_profiles` (
  `user_id` char(36) NOT NULL,
  `display_name` varchar(80) NOT NULL,
  `status` enum('active','suspended') NOT NULL DEFAULT 'active',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `sales_count` int unsigned NOT NULL DEFAULT '0',
  `approved_at` datetime(3) NOT NULL,
  `approved_by_staff_id` char(36) DEFAULT NULL,
  `suspended_at` datetime(3) DEFAULT NULL,
  `suspended_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_seller_display_name` (`display_name`),
  KEY `fk_seller_staff` (`approved_by_staff_id`),
  CONSTRAINT `fk_seller_staff` FOREIGN KEY (`approved_by_staff_id`) REFERENCES `admin_staff` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_seller_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_seller_rating` CHECK ((`rating_avg` between 0 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_profiles`
--

LOCK TABLES `seller_profiles` WRITE;
/*!40000 ALTER TABLE `seller_profiles` DISABLE KEYS */;
INSERT INTO `seller_profiles` VALUES ('06f484d9-2803-5261-9cac-69a1f239e7a0','Demo Seller','active',4.90,0,12,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902'),('0ab81975-02bb-4f67-b04f-64ee89cfcd64','Test1','active',0.00,0,0,'2026-10-16 18:37:39.509','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 18:37:39.509','2026-10-16 18:37:39.509'),('0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd','Alpha Inventory Co.','active',4.60,0,340,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902'),('21820986-720f-54fa-9408-6319948df579','Prime Source','active',4.80,0,567,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902'),('4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','Test','active',0.00,0,0,'2026-10-16 02:32:35.040',NULL,NULL,NULL,'2026-10-16 02:32:35.068','2026-10-16 02:32:35.068'),('6b35ca50-4e75-5785-9a78-6c681949a28f','Collector Hub','active',4.70,0,88,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902'),('86b22c36-e46a-5e1b-b6d8-af31142ff857','Elite Supply Co.','active',4.90,0,192,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902'),('9572028b-c6ee-5d00-a02d-44e8969fe19c','TopTier Collectibles','active',4.90,0,1248,'2026-09-24 12:00:00.000','5dc1081f-e6c8-5ff5-abbe-342f880dcc8c',NULL,NULL,'2026-10-16 00:26:23.902','2026-10-16 00:26:23.902');
/*!40000 ALTER TABLE `seller_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_addresses`
--

DROP TABLE IF EXISTS `user_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_addresses` (
  `user_id` char(36) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `line1` varchar(120) NOT NULL,
  `line2` varchar(120) DEFAULT NULL,
  `city` varchar(80) NOT NULL,
  `region` varchar(80) NOT NULL,
  `postal_code` varchar(20) NOT NULL,
  `country` char(2) NOT NULL DEFAULT 'US',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_address_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_addresses`
--

LOCK TABLES `user_addresses` WRITE;
/*!40000 ALTER TABLE `user_addresses` DISABLE KEYS */;
INSERT INTO `user_addresses` VALUES ('4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','Test','Test',NULL,'Test','GA','77644','US','2026-10-16 17:53:17.174');
/*!40000 ALTER TABLE `user_addresses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` char(36) NOT NULL,
  `username` varchar(30) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `avatar_key` varchar(255) DEFAULT NULL,
  `status` enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
  `terms_accepted_at` datetime(3) NOT NULL,
  `terms_version` varchar(20) NOT NULL DEFAULT '1.0',
  `email_verified_at` datetime(3) DEFAULT NULL,
  `last_login_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('06f484d9-2803-5261-9cac-69a1f239e7a0','seller_demo','seller@tsm.test','$2b$10$lT65fTav721NpwuXbvBDN.XTU0igO68OCfpGSGtbMqREzlSuo39Yq',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000','2026-10-16 01:56:43.734',NULL,'2026-09-24 12:00:00.000','2026-10-16 01:56:43.734'),('0ab81975-02bb-4f67-b04f-64ee89cfcd64','ArmonOne','armonx2004+1@gmail.com','$2b$12$65YQWEohbR2AWg4d6Au0CuilpbXrFDHiHbVQaGvCKr3gc719pRynS',NULL,NULL,'suspended','2026-10-16 18:33:15.524','1.0',NULL,NULL,NULL,'2026-10-16 18:33:15.524','2026-10-16 18:39:02.413'),('0fa6bad8-d90a-574c-8b0f-d1c1b1d924bd','alpha_inventory','alpha@tsm.test','$2b$10$SagaRM3e.VvWiaDr1YO4C..4NOLuTYQhkaEQ2DmxCIKImV1qE5fBC',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('21820986-720f-54fa-9408-6319948df579','prime_source','prime@tsm.test','$2b$10$lHYOpl7qI422ViYVSjjWYON7Qos5qZdtQ5DHvihjwWu4R3TN.1QP6',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('4e8f6862-45c0-46e6-a1f7-c25fc5cc2c88','Armon','armonx2004@gmail.com','$2b$12$zlwMhkkHTmnlTPWz.kmpK.GfWdbocvyEBpP13/ykCmUSJhFilYXC6',NULL,NULL,'active','2026-10-16 01:48:01.340','1.0',NULL,'2026-10-16 17:51:44.033',NULL,'2026-10-16 01:48:01.341','2026-10-16 17:51:44.033'),('6b35ca50-4e75-5785-9a78-6c681949a28f','collector_hub','hub@tsm.test','$2b$10$MdyGKd/hBF3RD/Vr8goS5eorvH7hLMh/aCiPXzLW69.ySSRrdhTN2',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('86b22c36-e46a-5e1b-b6d8-af31142ff857','elite_supply','elite@tsm.test','$2b$10$w0v5tsWs.USRED9bPHUfTOOlO7Wph8MqBzG1sJDqvB4AtAYTwMV5W',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('9572028b-c6ee-5d00-a02d-44e8969fe19c','toptier','toptier@tsm.test','$2b$10$Qqgy/FvqObzXazU4cst8J.kbNVwpgk6zjM7kgjeehpjWjSUDk4kn2',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('a03e2cdf-4b2b-5e84-9e1a-31fd1584f715','buyer_demo','buyer@tsm.test','$2b$10$BL6Idn8Ucg9HFNiYMSuafuwp6qajO6RLbHKkLWnoXuVA8Om.MdKqG',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900'),('d8c564db-8d2a-58e2-b0e5-5ca29e0c796f','applicant_demo','applicant@tsm.test','$2b$10$VJMqC7yREycBF3xlggUo.u/vfWQ2LPqLUc.7uSsmhPb2CfsOowiBG',NULL,NULL,'active','2026-09-24 12:00:00.000','1.0','2026-09-24 12:00:00.000',NULL,NULL,'2026-09-24 12:00:00.000','2026-10-16 00:26:23.900');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_product_summary`
--

DROP TABLE IF EXISTS `v_product_summary`;
/*!50001 DROP VIEW IF EXISTS `v_product_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_product_summary` AS SELECT 
 1 AS `product_id`,
 1 AS `brand`,
 1 AS `product_type`,
 1 AS `product_name`,
 1 AS `lowest_price`,
 1 AS `seller_count`,
 1 AS `is_fully_sold_out`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_product_summary`
--

/*!50001 DROP VIEW IF EXISTS `v_product_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`tsm_app`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_product_summary` AS select `p`.`id` AS `product_id`,`b`.`name` AS `brand`,`pt`.`name` AS `product_type`,`p`.`name` AS `product_name`,min((case when ((`lv`.`is_live` = 1) and (`lv`.`quantity_available` > 0)) then `lv`.`price` end)) AS `lowest_price`,count((case when ((`lv`.`is_live` = 1) and (`lv`.`quantity_available` > 0)) then 1 end)) AS `seller_count`,(case when ((count((case when (`lv`.`is_live` = 1) then 1 end)) > 0) and (count((case when ((`lv`.`is_live` = 1) and (`lv`.`quantity_available` > 0)) then 1 end)) = 0)) then 1 else 0 end) AS `is_fully_sold_out` from (((`products` `p` join `brands` `b` on((`b`.`id` = `p`.`brand_id`))) join `product_types` `pt` on((`pt`.`id` = `p`.`product_type_id`))) left join (select `l`.`product_id` AS `product_id`,`l`.`price` AS `price`,`l`.`quantity_available` AS `quantity_available`,((`l`.`is_active` = 1) and (`l`.`admin_hold` = 0) and (`sp`.`status` = 'active')) AS `is_live` from (`listings` `l` join `seller_profiles` `sp` on((`sp`.`user_id` = `l`.`seller_id`)))) `lv` on((`lv`.`product_id` = `p`.`id`))) where (`p`.`is_active` = 1) group by `p`.`id`,`b`.`name`,`pt`.`name`,`p`.`name` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-16 19:06:04
