-- Run this in your Supabase SQL editor:

create table public.jobs (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    status text not null,
    subject text,
    total_questions integer,
    solved_count integer
);

create table public.questions (
    id uuid default gen_random_uuid() primary key,
    job_id uuid references public.jobs(id) on delete cascade not null,
    question_number integer not null,
    thumbnail_url text,
    raw_text text,
    question_type text,
    options jsonb,
    answer text,
    explanation text,
    confidence text
);

insert into storage.buckets (id, name, public) 
values ('test-frames', 'test-frames', true)
on conflict (id) do nothing;

alter table public.jobs enable row level security;
alter table public.questions enable row level security;

create policy "allow all jobs" on public.jobs for all using (true);
create policy "allow all questions" on public.questions for all using (true);

create policy "public GET for test-frames"
  on storage.objects for select
  using ( bucket_id = 'test-frames' );

create policy "anon or authenticated can insert test-frames"
  on storage.objects for insert
  with check ( bucket_id = 'test-frames' );

create policy "anon or authenticated can update test-frames"
  on storage.objects for update
  using ( bucket_id = 'test-frames' );
