-- Stable keyset pages retain microsecond timestamps plus a unique ID tie-breaker.
create index messages_history_cursor on public.messages(project_id,created_at desc,id desc);
create index invoices_history_cursor on public.invoices(project_id,created_at desc,id desc);
create index records_history_cursor on public.payment_records(invoice_id,created_at desc,id desc);
create index requests_history_cursor on public.payment_requests(invoice_id,created_at desc,id desc);
create index claims_history_cursor on public.payment_claims(request_id,created_at desc,id desc);
