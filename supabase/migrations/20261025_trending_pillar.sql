-- 트렌딩 주제를 오늘의 기둥에 맞춘다 (2026-10-25).
--
-- 새 함수는 기존 claim_next_trending_topic()과 같은 동작에 기둥 조건만 더한 것이다.
-- 기존 함수는 그대로 둔다.
--
-- 기존 행은 pillar가 NULL이라 새 함수가 고르지 않는다(사실상 만료). 의도된 동작이다:
-- 기존 행은 전체 카테고리 인기 급상승에서 온 것이라 오늘 기둥과 무관하다.
-- 지우지 않으므로 (video_id, source) unique 중복 방지는 그대로 유지된다.

alter table trending_topics add column if not exists pillar text;

create or replace function claim_next_trending_topic_for_pillar(p_pillar text)
returns table(id bigint, video_id text, title text, description text, channel_title text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id bigint;
begin
  select t.id into v_id
    from trending_topics t
   where t.status = 'pending'
     and t.pillar = p_pillar
   order by t.fetched_at desc -- 가장 최신 트렌드 우선
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  update trending_topics
     set status = 'claimed', claimed_at = now()
   where trending_topics.id = v_id;

  return query
    select t.id, t.video_id, t.title, t.description, t.channel_title
      from trending_topics t
     where t.id = v_id;
end;
$function$;

revoke execute on function claim_next_trending_topic_for_pillar(text) from public, anon;
grant execute on function claim_next_trending_topic_for_pillar(text) to authenticated;
