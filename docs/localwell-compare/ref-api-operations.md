# Reference backend operation catalogue

Backend operations the reference UI invokes, extracted from its shipped page chunks. 552 distinct operation identifiers; 272 of them resolve to concrete request paths via the reference service registry.

## Resolved operations (operation -> request path)

| operation | request path |
|---|---|
| add_business_customer | /app/orderbook/mapping/add_business_customer |
| add_pay_acc_transaction | /cash_and_bank/add_pay_acc_transaction |
| add_sale_return_common | /app/returns/add_sale_return |
| api_generate_new_sale_return_details | /app/returns/generate_new_sale_return_details |
| api_get_b2b_sale_returns | /app/returns/get_b2b_sale_returns |
| authenticate_check_user_presence | /authenticate/check_user_presence |
| authenticate_create_password | /authenticate/password/set_password |
| authenticate_device_user | /authenticate/authenticate_device_user |
| authenticate_get_users_devices | /authenticate/get_users_devices |
| authenticate_send_login_otp | /authenticate/otp/send_login_otp |
| bulk_edit_bills | /app/sales/transactions/bulk_edit_bills |
| business_add_business | /app/business/add_business |
| business_get_barcode_settings | /app/business/get_barcode_settings |
| business_get_customer_order_settings | /app/business/get_customer_order_settings |
| business_get_master_business_entities | /app/business/get_master_business_entities |
| business_get_medcart_performance_stats | /app/store_settings/get_medcart_stats_and_info |
| business_get_prefix_sequence | /app/business/get_prefix_sequence |
| business_get_profile | /app/business/get_business_profile |
| business_get_sale_settings | /app/business/get_sale_settings |
| business_get_user_businesses | /authenticate/get_user_businesses |
| business_get_user_details | /app/business/get_business_users |
| business_get_user_profile | /app/business/get_user_profile |
| business_logout_device | /authenticate/logout_device |
| business_sync_customer_order_settings | /app/business/sync_customer_order_settings |
| business_sync_sale_settings | /app/business/sync_sale_settings |
| business_update_barcode_settings | /app/business/update_barcode_settings |
| business_update_business_profile | /app/business/update_business_profile |
| business_update_prefix_sequence | /app/business/update_prefix_sequence |
| business_validate_gstin | /app/api_vendors/validate_gstin |
| call_lw_account_manager | /crm_app/support/call_lw_account_manager |
| clear_redis_data | /app/socket/clear_redis_data |
| convert_customer_to_patient | /app/customers/convert_customers_to_patients |
| convert_to_pdf | /document/convert_to_pdf |
| create_purchase_custom_charge | /app/purchases/sync_custom_charge |
| customer_get_customer_filters | /app/customers/get_customer_filters |
| customer_get_customer_transactions | /app/customers/get_customer_transactions |
| customer_get_customers | /app/customers/get_customers |
| customer_get_mapping_customers | /app/customer_order/get_mapping_customers |
| customer_get_mapping_request | /app/orderbook/mapping/get_mapping_requests |
| customer_get_order_counts | /app/customer_order/get_order_counts |
| customer_get_order_filters | /app/customer_order/get_order_filters |
| customer_merge_customers | /app/customers/merge_customers |
| customer_orders_get_bounced_orders | /app/customer_order/get_bounced_orders |
| customer_orders_get_master_order_statuses | /app/customer_order/get_master_order_statuses |
| customer_orders_get_orders | /app/customer_order/get_orders |
| customer_orders_get_products_in_shortage | /app/customer_order/get_products_in_shortage |
| customer_orders_order_detail | /app/customer_order/get_customer_order_details |
| customer_search_customers_for_mapping | /app/orderbook/mapping/search_customers_for_mapping |
| customer_sync_customer_order | /app/customer_order/sync_customer_order |
| customer_update_feedback | /customer/sync_nps_csat_score |
| customers_get_customer_details | /app/customers/get_customer_details |
| customers_get_customer_invoices | /app/sales/returns/get_customer_invoices |
| customers_search_customers | /app/customers/search_customers |
| dashboard_get_cash_in_hand | /app/dashboard/get_cash_in_hand |
| dashboard_get_customer_summary | /app/dashboard/get_customer_summary |
| dashboard_get_fast_moving_stocks | /app/dashboard/get_fast_moving_stocks |
| dashboard_get_profit_summary | /app/dashboard/get_profit_summary |
| dashboard_get_purchases_summary | /app/dashboard/get_purchases_summary |
| dashboard_get_sales_summary | /app/dashboard/get_sales_summary |
| dashboard_get_slow_moving_stocks | /app/dashboard/get_slow_moving_stocks |
| dashboard_get_stock_value | /app/dashboard/get_stock_value |
| dashboard_get_youtube_video | /app/videos/get_yt_videos |
| delete_pay_acc | /app/cash_and_bank/delete_pay_acc |
| delete_pay_acc_transaction | /cash_and_bank/delete_pay_acc_transaction |
| distributor_get_distributor_transactions | /app/distributor/get_distributor_transactions |
| distributor_get_purchase_detail_from_csv | /distributor/get_purchase_detail_from_csv |
| distributors_get_challans_for_distributor | /app/distributor/get_challans_for_distributor |
| distributors_get_distributor_csv_method | /distributor/get_distributor_csv_method |
| distributors_get_distributor_details | /app/distributor/get_distributor_details |
| distributors_get_master_distributors | /app/distributor/get_master_distributors |
| distributors_merge_distributors | /app/distributor/merge_distributors |
| download_bulk_action_reports | /app/sales/transactions/download_bulk_action_reports |
| download_csv_template | /crm_app/migration/download_csv_template |
| download_pay_acc_statement | /app/cash_and_bank/download_pay_acc_statement |
| draft_get_drafts | /app/drafts/get_drafts |
| draft_sync_draft | /app/drafts/sync_draft |
| edit_pay_acc_transaction | /cash_and_bank/edit_pay_acc_transaction |
| edit_sale_return_common | /app/returns/edit_sale_return |
| expense_get_expense_details | /app/expense/get_expense_details |
| expense_get_metadata | /app/expense/get_expense_metadata |
| expense_sync_expense | /app/expense/sync_expense |
| expense_sync_party | /app/expense/sync_expense_party |
| expenses_get_expense_categories | /expense/get_expense_categories |
| expenses_get_expenses | /app/expense/get_expenses |
| expenses_get_parties | /app/expense/get_expense_parties |
| expenses_get_products | /app/expense/search_expense_products |
| followup_get_followup_list | /app/followups/get_followups |
| followup_get_patient_followups | /app/followups/get_followups_for_patient |
| followup_update_followup | /app/followups/update_followup |
| followups_get_patient_details | /app/customers/get_patient_details |
| generate_excel_migration_request | /crm_app/migration/generate_excel_migration_request |
| generate_new_migration_request | /crm_app/migration/generate_new_migration_request |
| generate_new_sale_details | /app/sales/invoice/generate_new_sale_details |
| geography_get_pincodes | /app/geography/get_pincodes |
| get_announcement_modal_data | /app/business/announcement/get_announcement_modal_data |
| get_bills_for_bulk_edit | /app/sales/transactions/get_bills_for_bulk_edit |
| get_bulk_edit_progress | /app/sales/transactions/get_bulk_edit_progress |
| get_business_account_manager | /crm_app/support/get_lw_account_manager |
| get_distributors_for_orderbook | /app/orderbook/distributors/get_distributors |
| get_followup_filters | /app/followups/get_followup_filters |
| get_mapping_business_for_migration | /crm_app/migration/get_mapping_business_for_migration |
| get_migration_request_details | /crm_app/migration/get_migration_request_details |
| get_migration_requests | /crm_app/migration/get_migration_requests |
| get_migration_softwares | /crm_app/migration/get_softwares |
| get_pay_acc_detail | /app/cash_and_bank/get_pay_acc_detail |
| get_pay_acc_filters | /app/cash_and_bank/get_pay_acc_filters |
| get_pay_acc_statement | /app/cash_and_bank/get_pay_acc_statement |
| get_pay_acc_transaction_detail | /app/cash_and_bank/get_pay_acc_transaction_detail |
| get_payment_account_summary | /app/cash_and_bank/get_pay_accs_summary |
| get_payment_accounts | /app/cash_and_bank/get_pay_accs |
| get_picklist_html | /app/stocks/get_picklist_html |
| get_presigned_url | /crm_app/migration/get_put_s3_signed_url |
| get_referral_transactions | /app/subscription/get_referral_transactions |
| get_sale_return_details | /app/returns/get_sale_return_details |
| get_software_files | /crm_app/migration/get_software_files |
| get_stock_batches_sale_return | /app/stocks/get_stock_batches_sale_return |
| get_stock_filters | /app/stocks/get_stock_filters |
| get_stock_return_transfer_details | /app/returns/b2b_return/get_stock_return_transfer_details |
| get_stock_return_transfers | /app/returns/b2b_return/get_stock_return_transfers |
| get_user_referral_details | /referral/get_user_referral_details |
| initiate_distributor_integration | /partners/zennx/initiate_distributor_integration |
| load_unmapped_stocks | /crm_app/migration/load_unmapped_stocks |
| mark_bounced_orders_as_processed | /app/customer_order/mark_bounced_orders_as_processed |
| medicine_get_hsn_gst_rates | /app/medicines/get_hsn_gst_rates |
| medicine_get_medicine_details | /app/medicines/get_medicine_details |
| medicine_search_medicines | /app/medicines/search_medicines |
| medicine_search_medicines_for_purchase | /app/medicines/search_medicines |
| medicine_search_medicines_for_purchase_return | /app/medicines/search_medicines |
| medicines_show_fuzzy_mappings | /app/medicines/show_fuzzy_mappings |
| migration_download_reports | /crm_app/migration/download_reports |
| orderbook_add_customer_orders | /app/customer_order/add_customer_order |
| orderbook_checkout_cart | /app/orderbook/cart/checkout_cart |
| orderbook_export_order_analysis | /app/orderbook/export/order_analysis |
| orderbook_export_purchase_order | /app/orderbook/export/purchase_order |
| orderbook_get_cart | /app/orderbook/cart/get_cart |
| orderbook_get_cart_details | /app/orderbook/cart/get_cart_details |
| orderbook_get_cart_filters | /app/orderbook/cart/get_cart_filters |
| orderbook_get_distributor_products | /app/orderbook/distributors/get_distributor_products |
| orderbook_get_distributors_for_medicine | /app/orderbook/cart/get_distributors |
| orderbook_get_document | /app/documents/get_document |
| orderbook_get_items_to_order | /app/orderbook/shortbook/get_shortbook |
| orderbook_get_order_analysis | /app/orderbook/orders/get_order_analysis |
| orderbook_get_popular_medicine_companies | /app/orderbook/dashboard/get_popular_medicine_companies |
| orderbook_get_purchase_order_detail | /app/orderbook/orders/get_purchase_order_detail |
| orderbook_get_purchase_order_items_excel | /report/get_purchase_order_items_excel |
| orderbook_get_purchase_order_timeline | /app/orderbook/orders/get_purchase_order_timeline |
| orderbook_get_purchase_orders | /app/orderbook/orders/get_purchase_orders |
| orderbook_get_settings | /app/orderbook/dashboard/get_shortbook_settings |
| orderbook_get_stock_categories | /app/orderbook/dashboard/get_stock_categories |
| orderbook_get_summary | /app/orderbook/dashboard/get_summary |
| orderbook_import_purchase | /app/orderbook/orders/import_purchase |
| orderbook_magic_assign_distributors | /app/orderbook/cart/magic_assign_distributors |
| orderbook_request_mapping_with_distributor | /app/orderbook/mapping/request_mapping_with_distributor |
| orderbook_search_businesses_for_distributors | /app/orderbook/mapping/search_businesses_for_mapping |
| orderbook_send_document | /app/documents/send_document |
| orderbook_sync_cart | /app/orderbook/cart/sync_cart |
| orderbook_sync_purchase_order | /app/orderbook/orders/sync_purchase_order |
| orderbook_sync_settings | /app/orderbook/dashboard/sync_shortbook_settings |
| orderbook_validate_checkout | /app/orderbook/cart/validate_checkout |
| partners_get_getting_started_status | /app/integrations/get_partner_getting_started_status |
| partners_get_kyc_docs | /app/integrations/kyc/get_kyc_docs |
| partners_get_partner_business_bank_details | /app/integrations/kyc/get_partner_business_bank_details |
| partners_get_partner_info | /app/integrations/get_partner_details |
| partners_get_partner_integration_status | /app/integrations/get_partner_integration_status |
| partners_get_partners_integrations | /app/integrations/get_partners |
| partners_initiate_partner_onboarding | /app/integrations/initiate_partner_integration |
| partners_trigger_email_otp | /app/integrations/email/trigger_email_otp |
| partners_upload_kyc_docs | /app/integrations/kyc/upload_kyc_docs |
| partners_verify_email_otp | /app/integrations/email/verify_business_email |
| payments_get_due_payments | /app/payments/get_due_payments |
| purchase_add_purchase | /purchase/add_purchase |
| purchase_add_purchase_return | /app/returns/add_purchase_return |
| purchase_delete_purchase | /app/purchases/delete_purchase |
| purchase_edit_purchase | /purchase/edit_purchase |
| purchase_get_purchase_bill_info | /app/purchases/get_purchase_bill_info |
| purchase_get_purchase_details | /app/purchases/get_purchase_details |
| purchase_get_purchase_transactions_by_date | /app/purchases/get_purchase_transactions_by_date |
| purchase_get_sale_custom_charge | /app/purchases/get_custom_charges |
| purchase_invoice_detect | /invoice/detect |
| purchases_delete_purchase_return | /app/returns/delete_purchase_return |
| purchases_edit_purchase_return | /app/returns/edit_purchase_return |
| purchases_get_products_for_purchase_challans | /purchase/get_products_for_purchase_challans |
| purchases_get_purchase_column_settings | /app/purchases/get_purchase_column_settings |
| purchases_get_purchase_return_details | /app/returns/get_purchase_return_details |
| purchases_get_purchase_return_invoice_details | /app/returns/invoice/get_purchase_return_invoice_details |
| purchases_get_purchase_return_invoice_html | /app/returns/invoice/get_purchase_return_invoice_html |
| purchases_get_unpaid_purchase_returns | /app/purchases/get_unpaid_purchase_returns |
| purchases_get_unpaid_purchase_returns_summary | /app/purchases/get_unpaid_purchase_returns_summary |
| purchases_sync_purchase_column_settings | /app/purchases/sync_purchase_column_settings |
| remove_uploaded_file | /crm_app/migration/remove_uploaded_file |
| report_download_csv | /document/download_csv |
| report_download_excel | /document/download_excel |
| report_download_html | /document/download_html |
| report_download_pdf | /document/download_pdf |
| report_send_email | /document/send_email |
| reports_add_starred_reports | /app/reports/add_starred_report |
| reports_get_reports | /app/reports/fetch_reports |
| reports_get_stock_value_summary | /report/get_stock_value_summary |
| reports_remove_starred_reports | /app/reports/remove_starred_report |
| sale_generate_sale_return_e_invoice | /sale/generate_sale_return_e_invoice |
| sale_update_customer_mapping | /app/sale_routes/update_route_for_customers |
| sale_update_e_invoiced_sale_return | /sale/update_e_invoiced_sale_return |
| sales_delete_sale_return_common | /app/returns/delete_sale_return |
| sales_email_distribution_sale_invoice | /sale/email_distribution_sale_invoice |
| sales_get_route_customers | /app/sale_routes/get_route_customers |
| sales_get_sale_invoice_details | /sale/get_sale_invoice_details |
| sales_get_sale_return_invoice_details | /app/returns/invoice/get_sale_return_invoice_details |
| sales_get_sale_return_invoice_html | /app/returns/invoice/get_sale_return_invoice_html |
| sales_get_sale_route_filters | /app/sale_routes/get_sale_route_filters |
| sales_get_sale_routes | /app/sale_routes/get_sale_routes |
| sales_get_sale_transactions_by_date | /app/sales/get_sale_transactions_by_date |
| sales_get_sale_transactions_metrics | /app/sales/get_sale_transactions_metrics |
| sales_get_sales | /app/sales/get_sales |
| sales_sync_salesman_mapping | /app/sale_routes/sync_salesman_mapping |
| send_test_app_notification | /app/business_user/send_test_app_notification |
| session_sync_device | /events/sync_device |
| settings_get_stock_settings | /app/stocks/settings/get_stock_settings |
| settings_update_stock_settings | /app/stocks/settings/update_stock_settings |
| sms_send_invoice_sms | /app/sales/notification/send_invoice_sms |
| stock_audit_create_audit | /app/stocks/audit/create_audit |
| stock_audit_delete_audit | /app/stocks/audit/delete_audit |
| stock_audit_finalize_audit | /app/stocks/audit/finalize_audit |
| stock_audit_get_audit_batches | /app/stocks/audit/get_audit_batches |
| stock_audit_get_audit_details | /app/stocks/audit/get_audit_details |
| stock_audit_get_audit_metadata | /app/stocks/audit/get_audit_metadata |
| stock_audit_get_audit_products | /app/stocks/audit/get_audit_products |
| stock_audit_get_audit_types | /app/stocks/audit/get_audit_types |
| stock_audit_get_audits | /app/stocks/audit/get_audits |
| stock_audit_get_filters | /app/stocks/audit/get_audit_filters |
| stock_audit_save_progress | /app/stocks/audit/save_progress |
| stock_get_duplicate_stocks | /app/stocks/get_duplicate_stocks |
| stock_get_stock_droplist | /app/purchases/stock_droplist/get_droplist |
| stock_merge_duplicate_stocks | /app/stocks/merge/merge_duplicate_stocks |
| stock_return_transfer_export_invoice | /app/returns/b2b_return/export_invoice |
| stock_transfer_get_stock_transfers | /app/stocktransfer/get_stock_transfers |
| stock_transfer_update_stock_transfer | /stocktransfer/update_stock_transfer |
| stocks_add_new_batch | /app/stocks/add_new_batch |
| stocks_download_invalid_rows | /app/stocks/download_invalid_rows_for_bulk_update |
| stocks_download_stocks_for_bulk_update | /app/stocks/download_stocks_for_bulk_update |
| stocks_get_expired_products | /app/stocks/get_products_for_purchase_return |
| stocks_get_stock_batches_purchase | /app/stocks/get_stock_batches_purchase |
| stocks_get_stock_batches_purchase_return | /app/stocks/get_stock_batches_purchase_return |
| stocks_get_stock_categories | /app/stocks/get_stock_categories |
| stocks_get_stock_detail_for_barcodes | /app/stocks/get_stock_detail_for_barcodes |
| stocks_get_stock_details_for_purchase | /stock/get_stock_details_for_purchase |
| stocks_get_stocks | /app/stocks/get_stocks |
| stocks_parse_excel_for_bulk_update | /stock/parse_excel_for_bulk_update |
| stocks_process_bulk_update_stocks | /app/stocks/process_bulk_update_stocks |
| stocks_sync_picklist | /app/stocks/sync_picklist |
| stocks_update_batch | /app/stocks/update_batch |
| subscription_complete_transaction | /app/subscription/complete_transaction |
| subscription_get_business_invoice_details | /app/subscription/get_business_invoice_details |
| subscription_get_localwell_coupons | /app/subscription/get_localwell_coupons |
| subscription_get_localwell_plans | /app/subscription/get_localwell_plans |
| subscription_get_subscription_details | /app/subscription/get_subscription_details |
| subscription_initiate_invoice_transaction | /app/subscription/initiate_invoice_transaction |
| subscription_request_sales_call | /app/subscription/create_sales_task |
| subscription_sync_draft_invoice | /app/subscription/sync_draft_invoice |
| sync_announcement_action | /app/business/announcement/sync_announcement_action |
| sync_partner_business_info_tabs | /app/integrations/sync_partner_business_info_tabs |
| sync_pending_to_map_stocks | /crm_app/migration/sync_pending_to_map_stocks |
| sync_settlement_bank_details | /app/store_settings/sync_settlement_bank_details |
| sync_stock_return_transfer | /app/returns/b2b_return/sync_stock_return_transfer |
| sync_stock_return_transfer_status | /app/returns/b2b_return/sync_stock_return_transfer_status |
| tickets_get_ticket_details | /crm_app/tickets/get_ticket_details |
| tickets_get_ticket_meta_data | /crm_app/tickets/get_ticket_metadata |
| tickets_get_tickets | /crm_app/tickets/get_tickets |
| tickets_get_tickets_counts | /crm_app/tickets/get_tickets_counts |
| tickets_sync_ticket_comment | /crm_app/tickets/sync_ticket_comment |
| tickets_sync_tickets | /crm_app/tickets/sync_ticket |
| update_distributor_customer_mapping_status | /app/orderbook/mapping/update_distributor_customer_mapping_status |
| validate_migration_file | /crm_app/migration/validate_migration_file |

## Path groups

- /stocks — 30 operations
- /orderbook — 30 operations
- /returns — 19 operations
- /business — 16 operations
- /migration — 14 operations
- /purchases — 11 operations
- /customer_order — 11 operations
- /integrations — 11 operations
- /sales — 10 operations
- /subscription — 9 operations
- /dashboard — 8 operations
- /cash_and_bank — 8 operations
- /customers — 8 operations
- /expense — 7 operations
- /tickets — 6 operations
- /medicines — 6 operations
- /distributor — 5 operations
- /sale_routes — 5 operations
- /followups — 4 operations
- /reports — 3 operations
- /documents — 2 operations
- /store_settings — 2 operations
- /drafts — 2 operations
- /support — 2 operations
- /download_pdf — 1 operations
- /download_html — 1 operations
- /edit_purchase — 1 operations
- /send_email — 1 operations
- /download_excel — 1 operations
- /get_products_for_purchase_challans — 1 operations
- /detect — 1 operations
- /download_csv — 1 operations
- /socket — 1 operations
- /get_stock_value_summary — 1 operations
- /get_sale_invoice_details — 1 operations
- /email_distribution_sale_invoice — 1 operations
- /stocktransfer — 1 operations
- /sync_device — 1 operations
- /business_user — 1 operations
- /parse_excel_for_bulk_update — 1 operations
- /generate_sale_return_e_invoice — 1 operations
- /update_e_invoiced_sale_return — 1 operations
- /update_stock_transfer — 1 operations
- /get_stock_details_for_purchase — 1 operations
- /add_purchase — 1 operations
- /get_purchase_detail_from_csv — 1 operations
- /delete_pay_acc_transaction — 1 operations
- /get_distributor_csv_method — 1 operations
- /otp — 1 operations
- /edit_pay_acc_transaction — 1 operations
- /get_user_businesses — 1 operations
- /api_vendors — 1 operations
- /convert_to_pdf — 1 operations
- /sync_nps_csat_score — 1 operations
- /videos — 1 operations
- /logout_device — 1 operations
- /check_user_presence — 1 operations
- /zennx — 1 operations
- /get_purchase_order_items_excel — 1 operations
- /payments — 1 operations
- /add_pay_acc_transaction — 1 operations
- /get_user_referral_details — 1 operations
- /get_users_devices — 1 operations
- /get_expense_categories — 1 operations
- /geography — 1 operations
- /password — 1 operations
- /authenticate_device_user — 1 operations

## Operations without a resolved path (invoked but registry not recovered)

- add_on_desktop
- add_on_mobile
- add_pur_bat_exp_date
- add_pur_bat_exp_datedatefield_month_inp
- add_purchase_apply_import_csv
- add_purchase_bill_discount
- add_purchase_bill_discount_amount
- add_purchase_challans
- add_purchase_cheque_details
- add_purchase_csv_import_method_id
- add_purchase_csv_method
- add_purchase_csv_rows
- add_purchase_custom_charge_type
- add_purchase_delivery_charge
- add_purchase_distributor
- add_purchase_district
- add_purchase_due_date
- add_purchase_import_type
- add_purchase_invoice_date
- add_purchase_invoice_number
- add_purchase_last_edited
- add_purchase_payment_mode
- add_purchase_payment_total_amount
- add_purchase_products
- add_purchase_purchase_is_challan
- add_purchase_purchase_return_settlement_amount
- add_purchase_purchase_return_settlements
- add_purchase_purchase_with_gst
- add_purchase_reference_no
- add_purchase_return_url
- add_purchase_settings
- add_purchase_total_payable_amount
- add_purchase_view_id
- add_purchase_view_mode
- add_sale_customer
- add_sale_customer_order_id
- add_sale_customer_order_number
- add_sale_doctor
- add_sale_invoice_date
- add_sale_is_stock_transfer
- add_sale_patient_details
- add_sale_payment_information
- add_sale_return_date
- add_sale_return_settings
- add_sale_return_url
- add_sale_settings
- add_sale_transfer_at
- add_sale_view_id
- add_sale_view_mode
- add_special_discount
- add_stock_details
- adding_subscription_from_max_login_page
- address_line_1
- address_line_2
- address_line_3
- addsale_return_batch
- administrative_area_level_1
- administrative_area_level_2
- administrative_area_level_3
- bank_account_for_pos_settlement
- bank_account_for_settlement
- business_account_settings
- business_image_url
- business_owners_name
- business_referral_code
- business_reports_view
- business_selected_district
- business_stock_category_id
- business_user_email
- business_user_name
- cash_and_bank
- cash_on_hand_account_id
- complete_business_kyc
- complete_business_profile
- copy_mrp_checkbox
- credit_note_no
- cust_facing_add_sale_bill_discount
- cust_facing_add_sale_delivery_charge
- cust_facing_add_sale_is_challan
- cust_facing_add_sale_is_stock_transfer
- cust_facing_add_sale_products
- cust_facing_add_sale_sale_return_settlement_amount
- cust_facing_add_sale_view_mode
- cust_facing_add_sale_with_gst
- cust_facing_sale_status
- customer_address_line_1
- customer_code_input
- customer_detail_drag_comp
- customer_order_selected_tab
- customer_order_settings
- customer_orders_date_filters
- customers_to_map
- dashboard_date_range
- data_migration_toggle
- datefield_date_inp
- datefield_month_inp
- datefield_year_inp
- discount_wrt_mrp
- discount_wrt_rate
- dl_form_20
- dl_form_20_expiry
- dl_form_21
- dl_form_21_expiry
- dont_return_products_to_cart
- drug_code_search
- dynamic_modal_shown
- e_invoicing_integration
- edit_purchase_order
- excel_column_header
- expense_with_gst
- extra_device_logins
- filtered_distributor_count
- filtered_products_count
- first_row_value
- followups_based_on
- followups_to_show
- followups_to_suggest
- from_bill_sequence
- from_sale_date
- getting_draft_id
- inp_sale_return_gst
- inp_sale_return_hsn
- inp_sale_return_item_discount
- inp_sale_return_mrp
- inp_sale_return_pack
- inp_sale_return_qty
- inp_sale_return_qty_packs
- inp_sale_return_rate
- input_purchase_transaction_scheme_quantity
- input_ret_price
- invoice_no_row
- is_customer_migration
- is_gst_registered
- is_gst_registeredinput
- is_in_stock
- is_order_paid_via_wallet
- is_sale_history_migration
- is_selected_for_update
- is_stock_migration
- is_stock_transfer
- is_supplier_migration
- item_purchase_transaction_scheme_quantity
- label_sale_rate
- last_control_center_tab
- last_row_value
- login_mobile_number_otp
- mandatory_gst_registration
- map_location_words
- margin_wrt_net_rate
- margin_wrt_rate
- mark_as_delivered
- markup_wrt_net_rate
- markup_wrt_rate
- max_bill_profit
- max_bill_value
- medicine_company_id
- medicine_company_name
- medicine_form_id
- merge_duplicate_stocks
- min_bill_profit
- min_bill_value
- min_sale_discount
- min_stock_demand
- multi_business_user
- non_composition_followups
- non_composition_products
- non_gst_registered
- notification_backoff_counter
- open_cheque_deposit_withdraw
- order_add_ons
- order_applied_coupon
- order_base_plan
- order_is_referral_coupon_removed
- order_status_id
- order_valid_gstin
- pay_accs_image_url
- payment_invoice_no
- pmbjay_drug_code
- pre_auth_mobile
- print_barcode_purchase_id
- product_info_modal_selected_district
- product_settings_cached_filters
- purchase_draft_id
- purchase_due_date
- purchase_invoice_date
- purchase_invoice_no
- purchase_margin_view
- purchase_pos_addon_plan
- purchase_return_add
- purchase_return_date
- purchase_return_delete
- purchase_return_edit
- purchase_return_view
- record_image_url
- refresh_customer_list
- refresh_distributor_list
- reports_category_tab_index
- ret_main_med_inv_date
- ret_med_exp_date
- ret_med_inv_date
- ret_med_qty
- return_expired_products
- return_invoice_list
- return_products_to_cart
- return_purchase_distributors
- return_purchase_return_url
- return_purchase_view_id
- return_purchase_view_mode
- return_sale_return_url
- return_sale_view_mode
- row_order_qty
- row_order_qty0
- sale_by_date_view
- sale_draft_id
- sale_invoice_no
- sale_margin_view
- sale_profit_view
- sale_ret_exp
- sale_return_add
- sale_return_batch_search_input
- sale_return_delete
- sale_return_edit
- sale_return_invoice_search_input
- sale_return_payable_amt
- sale_return_view
- selected_business_payment_account_id
- selected_report_meta_information
- setup_payment_gateway
- show_premium_icon_for_business
- sms_booster_packs
- srp_discount_wrt_mrp
- srp_margin_wrt_ptr
- srp_markup_wrt_ptr
- stock_audit_expiry_range
- stock_audit_saved_batches
- stock_audit_selected_items
- stock_audit_type_id
- stock_list_left_data
- stock_list_right_data
- stock_margin_view
- stock_picklist_sale_detail
- stock_picklist_show_print
- stock_picklist_validated_customer_order_id
- stock_return_transfer_id
- stock_transfer_date_range
- stock_transfer_view_state
- sublocality_level_1
- sublocality_level_2
- sublocality_level_3
- temp_business_id
- ticket_category_name
- to_bill_sequence
- to_sale_date
- transaction_record_image_url
- transfer_with_gst
- transfer_without_gst
- update_business_stock_category_id
- update_ignore_for_shortage_calculation
- update_is_loose_billing_disabled
- update_is_stock_discount_locked
- update_max_sale_discount
- update_medicine_form_id
- update_min_sale_discount
- update_preferred_distributor_id
- update_sale_scheme
- update_stock_item_online_discount
- update_stock_listed_online
- update_stock_location
- upgrade_your_plan
- user_permissions_object
- view_customer_item_from_global_search
- view_customer_selected_details
- view_distributor_selected_details
- view_purchase_selected_tab
- view_reminders_selected_details
- view_sale_selected_date_range
- view_sale_selected_details
- view_sale_selected_tab
- view_sales_page
- view_stock_selected_details
