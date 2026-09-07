ALTER TABLE "draft"."draft_transition" DROP CONSTRAINT "draft_transition_legal_pair";--> statement-breakpoint
ALTER TABLE "draft"."draft_transition" ADD CONSTRAINT "draft_transition_legal_pair" CHECK (("draft"."draft_transition"."from_state", "draft"."draft_transition"."to_state") IN (
        ('proposed', 'drafted'), ('drafted', 'redlined'), ('redlined', 'in_review'), ('redlined', 'drafted'),
        ('redlined', 'blocked'), ('in_review', 'in_review'), ('in_review', 'accepted'), ('in_review', 'rejected'),
        ('accepted', 'published'), ('accepted', 'rejected'), ('blocked', 'proposed'), ('rejected', 'proposed')
      ) OR (
        "draft"."draft_transition"."to_state" = 'blocked' AND "draft"."draft_transition"."reason" IS NOT DISTINCT FROM 'deadline_exceeded'
        AND "draft"."draft_transition"."from_state" IN ('proposed', 'drafted', 'redlined', 'in_review', 'accepted')
      ));