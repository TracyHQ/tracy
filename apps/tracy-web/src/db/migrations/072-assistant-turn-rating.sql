-- A thumbs up or down on a Help answer (tasks/todo-lenh-help.md, step 4a): the only way to measure
-- whether Help answers well. One rating per answer, changeable, never read by the model.
alter table assistant_turn add column rating smallint check (rating in (-1, 1));
