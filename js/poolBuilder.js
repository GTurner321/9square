// Question Grid — pool builder
// Turns whichever selection method the user picked into a filtered
// pool of practice-set questions. Kept separate from setup.js so the
// same logic can be reused to rebuild a pool when loading a saved
// starter, without re-deriving it from live form state.
//
// The Pearson-book path now works at sub-topic granularity: chapters
// narrow down which sub-topic rows are on offer, but the actual pool
// is built from whichever individual sub-topics are still ticked.

const PoolBuilder = (() => {

  /**
   * Every Pearson-books row (i.e. every sub-topic) belonging to the
   * given book + selected chapters - the full candidate list a
   * sub-topic checklist should be populated from.
   */
  function getSubtopicRows(pearsonRows, book, chapters) {
    const chapterSet = new Set(chapters);
    return pearsonRows.filter(row => row.book === book && chapterSet.has(row.chapter));
  }

  /**
   * Like getSubtopicRows, but across several books at once - used when
   * more than one book is selected, since chapter names alone aren't
   * unique across books. bookChapterPairs is an array of { book, chapter }.
   */
  function getSubtopicRowsMultiBook(pearsonRows, bookChapterPairs) {
    const wanted = new Set(bookChapterPairs.map(p => p.book + '\u0000' + p.chapter));
    return pearsonRows.filter(row => wanted.has(row.book + '\u0000' + row.chapter));
  }

  /**
   * Unions the DF ref numbers of the given sub-topic rows, then
   * filters the practice set down to questions tagged with any of
   * those refs.
   */
  function fromSubtopicRows(practiceSet, subtopicRows) {
    const refSet = new Set();
    subtopicRows.forEach(row => row.refs.forEach(r => refSet.add(r)));
    return practiceSet.filter(q => refSet.has(q.dfRefNum));
  }

  /**
   * Filters the practice set to every question whose DF ref is tagged
   * (in df_tally.csv) with the given Year/course tag, e.g. "GCSE
   * Higher". Tag matching is case-insensitive since it's typed by hand
   * into a spreadsheet cell.
   */
  function fromYearTag(practiceSet, dfTallyRows, tag) {
    const wanted = tag.trim().toLowerCase();
    const refSet = new Set();
    dfTallyRows.forEach(row => {
      if (row.tags.some(t => t.toLowerCase() === wanted)) refSet.add(row.topicNum);
    });
    return practiceSet.filter(q => refSet.has(q.dfRefNum));
  }

  /**
   * Filters the practice set directly against a hand-typed list of
   * Dr Frost skill numbers - no Pearson-books lookup involved.
   */
  function fromDfRefs(practiceSet, dfRefs) {
    const refSet = new Set(dfRefs);
    return practiceSet.filter(q => refSet.has(q.dfRefNum));
  }

  // The White Rose Year/Course setup choices, and the row tag(s) each
  // one requires ALL of - see normaliseWrmRow in dataService.js for why
  // a single row can satisfy more than one of these (its Year/Course
  // cell can carry several tags at once, e.g. a Year 10 row tagged for
  // both Foundation and Higher).
  const WRM_YEAR_OPTIONS = [
    { value: 'year7', label: 'Year 7', tags: ['Year 7'] },
    { value: 'year8', label: 'Year 8', tags: ['Year 8'] },
    { value: 'year9', label: 'Year 9', tags: ['Year 9'] },
    { value: 'year10f', label: 'Year 10 Foundation', tags: ['Year 10', 'GCSE Foundation'] },
    { value: 'year11f', label: 'Year 11 Foundation', tags: ['Year 11', 'GCSE Foundation'] },
    { value: 'year10h', label: 'Year 10 Higher', tags: ['Year 10', 'GCSE Higher'] },
    { value: 'year11h', label: 'Year 11 Higher', tags: ['Year 11', 'GCSE Higher'] }
  ];

  function wrmRowMatchesYearOption(row, yearOptionValue) {
    const option = WRM_YEAR_OPTIONS.find(o => o.value === yearOptionValue);
    if (!option) return false;
    return option.tags.every(t => row.yearTags.includes(t));
  }

  /**
   * Every White Rose row belonging to the given Year/Course choice -
   * the full candidate list a Blocks checklist should be populated
   * from.
   */
  function getWrmRowsForYear(wrmRows, yearOptionValue) {
    return wrmRows.filter(row => wrmRowMatchesYearOption(row, yearOptionValue));
  }

  /**
   * Like getWrmRowsForYear, but further narrowed to the selected
   * blocks - the candidate list a Small steps checklist should be
   * populated from.
   */
  function getWrmSmallStepRows(wrmRows, yearOptionValue, blocks) {
    const blockSet = new Set(blocks);
    return getWrmRowsForYear(wrmRows, yearOptionValue).filter(row => blockSet.has(row.block));
  }

  /**
   * Rebuilds a pool from a saved descriptor - the same shape SaveQuiz
   * stores alongside a saved starter's box layout. For the Pearson-book
   * method, the descriptor records the exact book+chapter+sub-topic
   * triples that were ticked (not just the chapters), since sub-topics
   * can be individually deselected and multiple books can be involved.
   * The White Rose method mirrors this at year+block+small-step
   * granularity.
   */
  function fromDescriptor(practiceSet, pearsonRows, wrmRows, dfTallyRows, descriptor) {
    if (descriptor.method === 'pearsonBook') {
      const wanted = new Set(descriptor.subtopics.map(s => s.book + '\u0000' + s.chapter + '\u0000' + s.subTopic));
      const rows = pearsonRows.filter(row => wanted.has(row.book + '\u0000' + row.chapter + '\u0000' + row.subTopic));
      return fromSubtopicRows(practiceSet, rows);
    }
    if (descriptor.method === 'wrm') {
      const wanted = new Set(descriptor.smallSteps.map(s => s.block + '\u0000' + s.smallStep));
      const rows = wrmRows.filter(row =>
        wrmRowMatchesYearOption(row, descriptor.year) && wanted.has(row.block + '\u0000' + row.smallStep)
      );
      return fromSubtopicRows(practiceSet, rows);
    }
    if (descriptor.method === 'dfRefs') {
      return fromDfRefs(practiceSet, descriptor.dfRefs);
    }
    if (descriptor.method === 'yearCourse') {
      return fromYearTag(practiceSet, dfTallyRows, descriptor.tag);
    }
    return [];
  }

  function describeDescriptor(descriptor) {
    if (!descriptor || !descriptor.method) return 'Unknown selection';
    if (descriptor.method === 'pearsonBook') {
      // Older saved starters (pre multi-book) used a singular `book`
      // field instead of `books` - fall back gracefully rather than
      // throwing, since a stale localStorage entry shouldn't be able
      // to break the whole setup page.
      const books = descriptor.books || (descriptor.book ? [descriptor.book] : []);
      return books.length ? books.join(', ') : 'Pearson book selection';
    }
    if (descriptor.method === 'wrm') {
      const yearOption = WRM_YEAR_OPTIONS.find(o => o.value === descriptor.year);
      return `White Rose: ${yearOption ? yearOption.label : (descriptor.year || '?')}`;
    }
    if (descriptor.method === 'dfRefs') {
      return `DF refs ${(descriptor.dfRefs || []).join(', ')}`;
    }
    if (descriptor.method === 'yearCourse') {
      return `Year/course: ${descriptor.tag || '?'}`;
    }
    return 'Unknown selection';
  }

  return {
    getSubtopicRows, getSubtopicRowsMultiBook, fromSubtopicRows, fromDfRefs, fromYearTag,
    WRM_YEAR_OPTIONS, wrmRowMatchesYearOption, getWrmRowsForYear, getWrmSmallStepRows,
    fromDescriptor, describeDescriptor
  };
})();
