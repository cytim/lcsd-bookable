$(function() {
  /* * * * * * * * * * * * * * * * * * * * *
   * Global Variables
   * * * * * * * * * * * * * * * * * * * * */

  // Never modify the state object directly for data integrity
  // Update should be done by calling `setState(...)`
  var state = {
    view: {
      search: {
        date: [],
        facility: [],
        facilityType: [],
        session: [],
        area: []
      }
    },
    data: {
      search: {
        date: null,
        facility: null,
        facilityType: null,
        session: null,
        area: null
      },
      filter: {
        bookable: false
      },
      venues: []
    }
  }

  var $criteria = {
    date: $('#select-date'),
    facility: $('#select-facility'),
    facilityType: $('#select-facility-type'),
    session: $('#select-session'),
    area: $('#select-area')
  };

  var $loading     = $('.loading');
  var $searchPanel = $('#search-panel');
  var $resultPanel = $('#search-result-panel');

  /* * * * * * * * * * * * * * * * * * * * *
   * Helpers
   * * * * * * * * * * * * * * * * * * * * */

  function dispatch(action) {
    chrome.runtime.sendMessage(action);
  }

  function setState(newState) {
    return _.assign(state, newState);
  }

  function updateSearchInput(key, val) {
    var update = _.set({}, key, val);
    setState({
      data: _.defaults({
        search: _.defaults(update, state.data.search)
      }, state.data)
    });
  }

  function aggregateSlots(arrayOfSlots) {
    return _.sortBy(_.union.apply(_, arrayOfSlots));
  }

  /* * * * * * * * * * * * * * * * * * * * *
   * Filter
   * * * * * * * * * * * * * * * * * * * * */

  var filterVenuesBy = {
    bookable: function(venues, mustBeBookable) {
      if (!mustBeBookable)
        return venues;
      return _.filter(venues, function(venue) {
        return _.some(venue.slots, function(slot) {
          return slot.status === '';
        });
      });
    }
  };

  function filterVenues(venues, filters) {
    return _.reduce(filters, function(_venues, params, filter) {
      return filterVenuesBy[filter](_venues, params);
    }, venues);
  }

  /* * * * * * * * * * * * * * * * * * * * *
   * View Update
   * * * * * * * * * * * * * * * * * * * * */

  function updateSearchView() {
    function createOptions($select, options, selectedVal) {
      var $option;
      $select.empty();
      for (var i = 0; i < options.length; i++) {
        $option = $('<option>', {
            value: options[i].value,
            selected: options[i].value === selectedVal
          })
          .text(options[i].display);
        $select.append($option);
      }
    }

    _.forOwn($criteria, function($criterion, field) {
      var options     = state.view.search[field];
      var selectedVal = state.data.search[field];
      // special handling for [area] for better user experience
      if (field === 'area' && options.length > 2) {
        options.unshift(options.reverse().pop());
      }
      createOptions($criterion, options, selectedVal);
      var firstValue;
      if (state.view.search[field].length === 1) {
        firstValue = $criterion.children('option:first-of-type').val();
        $criterion.val(firstValue);
        updateSearchInput(field, firstValue);
      }
    });

    $('select.search-criteria').material_select();
  }

  function updateSearchResultView() {
    var venues        = filterVenues(state.data.venues, state.data.filter);
    var slots         = aggregateSlots(_.map(venues, function(venue) { return _.keys(venue.slots); }));
    var $panel        = $resultPanel;
    var $panelMessage = $panel.children('#result-message');
    var $panelTable   = $panel.children('#result-table');
    var $tableHeader  = $panelTable.children('.result-table-header');
    var $tableBody    = $panelTable.children('.result-table-body');

    if (!venues || !venues.length) {
      $panelTable.hide();
      $panelMessage
        .children('.message').text('殘念 ( ´･･)ﾉ(._.`)').end()
        .show();
    }
    else {
      updateSearchResultTableHeader($tableHeader, slots);
      updateSearchResultTableBody($tableBody, venues, slots);
      $panelMessage.hide();
      $panelTable.show();
      $tableHeader.stick_in_parent();
    }
  }

  function updateSearchResultTableHeader($header, slots) {
    var $slots = $header.find('.location-row ul.slots').empty();
    _.forEach(slots, function(slot) {
      $slots.append($('<li>').text(slot.split('|')[0]));
    });
  }

  function updateSearchResultTableBody($body, venues, slots) {
    var $list = $body.children('ul.result-table-list').empty();
    _.forEach(venues, function(venue) {
      var $venueRow  = createLocationRow(venue, slots);
      var $courtRows = $('<div class="court-rows"></div>');
      _.forEach(venue.courts, function(court) {
        $courtRows.append(createLocationRow(court, slots));
      });
      $list.append(
        $('<li>')
          .append($('<div class="collapsible-header"></div>').append($venueRow))
          .append($('<div class="collapsible-body"></div>').append($courtRows))
      );
    });
  }

  function createLocationRow(location, slots) {
    var $location = $('<div class="location"></div>').text(location.name);
    var $slots    = $('<ul class="slots"></ul>');
    _.forEach(slots, function(slot) {
      var slotDetail = location.slots[slot];
      if (slotDetail) {
        $slots.append(
          $('<li>', {
            class: slotDetail.isPeak === true ? 'slot-peak' : slotDetail.isPeak === false ? 'slot-non-peak' : 'slot-disabled'
          }).append(
            $('<i>', {
              class: 'fa ' + (slotDetail.status === '' ? 'fa-check slot-available' : 'fa-times slot-unavailable')
            })
          )
        );
      }
      else {
        $slots.append($('<li class="slot-disabled"><i class="fa fa-times slot-unavailable"></i></li>'));
      }
    });
    return $('<div class="location-row"></div>').append($location).append($slots);
  }

  /* * * * * * * * * * * * * * * * * * * * *
   * Process
   * * * * * * * * * * * * * * * * * * * * */

  var processors = {
    updateSearchCriteria: function(options) {
      setState({
        view: _.defaults({
          search: _.defaults(options, state.view.search)
        }, state.view)
      });
      updateSearchView();
    },

    processFacilitiesSearch: function(venues) {
      setState({
        data: _.defaults({
          venues: venues
        }, state.data)
      });
      updateSearchResultView();
      $loading.fadeOut(250);
    }
  };

  /* * * * * * * * * * * * * * * * * * * * *
   * Dispatch
   * * * * * * * * * * * * * * * * * * * * */

  function dispatchSearchInputUpdate(input) {
    dispatch(Action.create(Action.SEARCH_INPUT_UPDATE, input));
  }

  function dispatchFacilitiesSearchRequest() {
    $loading.fadeIn(250, function() {
      dispatch(Action.create(Action.FACILITIES_SEARCH_REQUEST));
    });
  }

  function dispatchSearchCriteriaRequest() {
    dispatch(Action.create(Action.SEARCH_CRITERIA_REQUEST));
  }

  /* * * * * * * * * * * * * * * * * * * * *
   * Initialization
   * * * * * * * * * * * * * * * * * * * * */

  jQuery.extend(jQuery.validator.messages, {
    required: "必填"
  });

  $('select.search-criteria').material_select();

  // Listen to dispatched actions
  chrome.runtime.onMessage.addListener(function(action) {
    if (action.error)
      throw action.error;
    if (processors[action.type])
      return processors[action.type](action.data);
  });

  // bind change listener to all $criteria
  _.forOwn($criteria, function($criterion, field) {
    $criterion.change(function() {
      var value = $(this).val();
      updateSearchInput(field, value);
      dispatchSearchInputUpdate(_.set({}, field, value));
      $(this).valid();
    });
  });

  $('#result-filter #filter-bookable input[type="checkbox"]').change(function() {
    setState({
      data: _.defaults({
        filter: _.defaults({
          bookable: $(this).is(':checked')
        }, state.data.filter)
      }, state.data)
    });
    updateSearchResultView();
  });

  // The configuration is valid for select elements only.
  // It should be updated once there are other input
  // elements to validate.
  $searchPanel.validate({
    ignore: '.select-dropdown',
    errorClass: 'validate-invalid',
    validClass: 'validate-valid',
    highlight: function(element, invalid, valid) {
      $(element)
        .removeClass(valid).addClass(invalid)
        .parent().removeClass(valid).addClass(invalid)
    },
    unhighlight: function(element, invalid, valid) {
      $(element)
        .removeClass(invalid).addClass(valid)
        .parent().removeClass(invalid).addClass(valid)
    },
    errorPlacement: function(error, element) {
      error.insertBefore(element.parent());
    },
    submitHandler: function() {
      dispatchFacilitiesSearchRequest();
    }
  });

  dispatchSearchCriteriaRequest();
});
