var services = {
	fields: [
		{ "name": "case", "label": "Case #"},
		{ "name": "date", "label": "Date", isDate: true},
		{ "name": "officer", "label": "Officer"},
		{ "name": "roadon", "label": "On"},
		{ "name": "roadat", "label": "At"},
		{ "name": "roadto", "label": "To"}
	],
	address: "http://maps.raleighnc.gov/ArcGIS/rest/services/Addresses/MapServer/0",
	geometry: "http://gis.raleighnc.gov/ArcGIS/rest/services/Utilities/Geometry/GeometryServer",
	places: [
		{name: "Beats",
			url: "http://gis.raleighnc.gov/arcgis/rest/services/Crime/crime_searchlocation/MapServer/1",
			fields: ["BEAT"],
			shape: "polygon"
		},
		{name: "District",
			url: "http://gis.raleighnc.gov/arcgis/rest/services/Crime/crime_searchlocation/MapServer/2",
			fields: ["DISTRICT"],
			shape: "polygon"
		}
	]
}
var map, markers, layers, heatMap, bufferMarkers, drawControl, whereArr = [];
var lastFeature, lastFs;
var sheets;
var categories;
//table functions//
function tableRowClicked () {
	var point = L.latLng($(this).data("y"), $(this).data("x"));
	map.setView(point, 18);
}
//crime search functions//
function showWarning (message) {
	$('.alert').show().html(message);
	setTimeout(function () {
		$('.alert').hide();
	}, 5000);
}

//SEARCH FUNCTIONS//
//address search//
function addressSelected (obj, datum, dataset) {
	$.ajax({
		url: services.address + "/query",
		dataType: 'json',
		data: {f: 'pjson',
			where: "Address='"+datum.value+"'",
			returnGeometry: true,
			outSR: 4326
		},
	})
	.done(function(data) {
		if (data.features.length > 0) {
			map.setView([data.features[0].geometry.y, data.features[0].geometry.x], 16);
		}
	});
}
function setAddressTypeAhead() {
	$("#addressInput").typeahead([
		{
			remote: {
				url: "http://maps.raleighnc.gov/ArcGIS/rest/services/Addresses/MapServer/0/query?where=UPPER(Address) like UPPER('%QUERY%') &orderByFields=Address&returnGeometry=true&outFields=Address&f=pjson",
				dataType: "jsonp",
				filter: function (resp) {
					var values = [];
					$(resp.features).each(function (i, r) {
						values.push(r.attributes.ADDRESS);
					})
					return values;
				}
			}
		}
	]).on("typeahead:selected", addressSelected);
}
//intersection search//
function findIntersection () {
	var street2 = $("option:selected", this).val(),
		street1 = $("#street1").val();
	$.ajax({
		url: 'http://maps.raleighnc.gov/arcgis/rest/services/Locators/WakeLocator/GeocodeServer/findAddressCandidates',
		dataType: 'jsonp',
		data: {f: 'pjson',
			"Single Line Input": street1+" & "+street2,
			outSR: 4326
		},
	})
	.done(function(data) {
		if (data.candidates.length > 0) {
			map.setView([data.candidates[0].location.y, data.candidates[0].location.x], 16);
		}
	});
}
function findIntersectingStreets (geom) {
	$.ajax({
		url: 'http://maps.raleighnc.gov/ArcGIS/rest/services/StreetsDissolved/MapServer/0/query',
		type: 'POST',
		dataType: 'json',
		data: {f: 'json',
			'uniq_param' : (new Date()).getTime(),
			geometry: JSON.stringify(geom),
			where: "CARTONAME <> '" + $("#street1").val() + "'",
			outFields: "CARTONAME",
			returnGeometry: false,
			orderByFields: "CARTONAME",
			geometryType: "esriGeometryPolyline",
			spatialRel: "esriSpatialRelIntersects"
		},
	})
	.done(function(data) {
		if (data.features.length > 0) {
			$(".form-intersection:gt(0)").show();
			$("#street2").empty();
			$("#street2").append("<option disabled selected>Select Intersecting Street...</option>");
			$("#street2").removeProp('disabled');
			$(data.features).each(function (i, f) {
				$("#street2").append("<option>" + f.attributes.CARTONAME + "</option>");
			})
		}
	});
}
function street1Selected(obj, datum, dataset) {
	$.ajax({
		url: 'http://maps.raleighnc.gov/ArcGIS/rest/services/StreetsDissolved/MapServer/0/query',
		dataType: 'jsonp',
		data: {f: 'pjson',
			where: "CARTONAME = '" + datum.value + "'",
			returnGeometry: true,
			outFields: "CARTONAME",
			orderByFields: "CARTONAME"
		},
	})
	.done(function(data) {
		if (data.features.length > 0) {
			var geom = data.features[0].geometry;
			findIntersectingStreets(geom);
		}
	});
}
function setIntersectionTypeAhead() {
	$("#street1").typeahead([
		{
			remote: {
				url: "http://maps.raleighnc.gov/ArcGIS/rest/services/StreetsDissolved/MapServer/0/query?where=UPPER(CARTONAME) like UPPER('%QUERY%') &orderByFields=CARTONAME&returnGeometry=false&outFields=CARTONAME&f=pjson",
				dataType: 'jsonp',
				filter: function (resp) {
					var values = [];
					$(resp.features).each(function (i, r) {
						values.push(r.attributes.CARTONAME);
					})
					return values;
				}
			}
		}
	]).on("typeahead:selected", street1Selected);
	$("#street2").change(findIntersection);
}
//initialize page elements//
function setColumns (index) {
	var headers = services.crime[index].headers.split(","),
		tr = $("#list>thead>tr").empty();
	$(headers).each(function (i, h) {
		tr.append("<th>" + h + "</th>");
	});

}
function setTimeSearch () {
	$("#fromTime").datetimepicker({pickDate: false, useSeconds: false, minuteStepping: 30});
	$("#toTime").datetimepicker({pickDate: false, useSeconds:false, minuteStepping: 30});

}
function setDateSearch () {
	$("#fromDate").datetimepicker({pickTime: false});
	$("#toDate").datetimepicker({pickTime: false});
	$('#fromDate').data("DateTimePicker").setDate(new Date().setMonth(new Date().getMonth() -1 ));
	$('#toDate').data("DateTimePicker").setDate(new Date());

}
function searchByTypeChanged () {
	var cls = $("option:selected", this).val();
	$(".form-location .form-group").hide();
	$("."+cls).show();
	$(".form-place:gt(0)").hide();
	$(".form-intersection:gt(0)").hide();
}
function setLocationForm() {
	$(".form-search-by").change(searchByTypeChanged);
}


function testCanvas () {
  	return !$('html').hasClass('ie6') && !$('html').hasClass('ie7') && !$('html').hasClass('ie8') && !$('html').hasClass('ie9');
}

function loadBeats () {
	$.getJSON('data/beats.geojson', function(json, textStatus) {
		var group = L.layerGroup(),
			districts = L.geoJson(json, {
			style: function (feature) {
				return {opacity: 1, color: 'red'};
			},
			onEachFeature: function (feature, layer) {
				group.addLayer(L.marker(getCentroid(layer.getLatLngs()), {
					icon: L.divIcon({
						html: feature.properties.BEAT,
						className: 'title-overlay',
						iconSize: [10, 10]
					})
				}));
			}
		}).addTo(group);
		layers.addOverlay(group, "Beats");
	});
}

function loadDistricts () {
	$.getJSON('data/districts.geojson', function(json, textStatus) {
		var group = L.layerGroup(),
			districts = L.geoJson(json, {
			style: function (feature) {
				return {opacity: 1};
			},
			onEachFeature: function (feature, layer) {
				group.addLayer(L.marker(getCentroid(layer.getLatLngs()), {
					icon: L.divIcon({
						html: feature.properties.DISTRICT,
						className: 'title-overlay',
						iconSize: [40, 10]
					})
				}));
			}
		}).addTo(group);
		layers.addOverlay(group, "Districts");

	});
}

function getCentroid(pts) {
    if (pts[0] instanceof Array) {
        pts = pts[0];
    }
    var off = pts[0];
    if (off.lat) {
        off = [off.lat, off.lng];
    }
    var twicearea = 0;
    var x = 0;
    var y = 0;
    var nPts = pts.length;
    var p1, p2;
    var f;
    for (var i = 0, j = nPts - 1; i < nPts; j = i++) {
        p1 = pts[i];
        p2 = pts[j];
        if (p1.lat) {
            p1 = [p1.lat, p1.lng];
            p2 = [p2.lat, p2.lng];
        }
        f = (p1[0] - off[0]) * (p2[1] - off[1]) - (p2[0] - off[0]) * (p1[1] - off[1]);
        twicearea += f;
        x += (p1[0] + p2[0] - 2 * off[0]) * f;
        y += (p1[1] + p2[1] - 2 * off[1]) * f;
    }
    f = twicearea * 3;
    return {
        lat: x / f + off[0],
        lng: y / f + off[1]
    };
}

function setMap() {
	map = L.map('map', {drawControl:false, minZoom: 10}).setView([35.7769, -78.6436],11);
      L.tileLayer('http://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom: 16, attribution: 'Esri, DeLorme, NAVTEQ'}).addTo(map);
			L.tileLayer('http://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',{maxZoom: 16, attribution: 'Esri, DeLorme, NAVTEQ'}).addTo(map);
	markers = new L.MarkerClusterGroup({spiderfyOnMapZoom: true}).addTo(map);
	bufferMarkers = new L.featureGroup().addTo(map);
	//heatMap = new L.DivHeatmapLayer({}).addTo(map);
	if (testCanvas()) {
		heatMap = L.heatLayer([], {radius: 25});
		layers = L.control.layers({"Clusters": markers, "Heat Map": heatMap}).addTo(map);
	}
	loadBeats();
	loadDistricts();
}
function exportTable () {
	var lid = $("option:selected","#searchFor").index(),
		headers = services.crime[lid].headers.split(","),
		fields = services.crime[lid].fields.split(","),
		dateField = services.crime[lid].fields.split(",")
		results = [];
	$(lastFs.features).each(function (i, f) {
		var result = [];
		$(headers).each(function (i, header) {
			var fld = fields[i];;

			if (fld === dateField) {
				result.push(new Date(f.attributes[fld]).toUTCString().replace(":00 GMT", "").split(",").join(" "));
			} else {
				result.push('"'+f.attributes[fld]+'"');
			}
		});
		results.push(result);
	});
	$("#exportcolumns").attr("value", JSON.stringify(headers));
	$("#exportdata").attr("value", JSON.stringify(results));
	document.getElementById('exportform').submit();
}
function printWindowLoaded (win, timer) {
	var lid = $("option:selected","#searchFor").index();
	win.setMap(bufferMarkers.getLayers()[0].getLatLngs(), markers.getLayers(), lastFs, services.crime[lid].fields, services.crime[lid].headers, services.crime[lid].dateField);
	clearTimeout(timer);
}
function print () {
	var printWin = window.open("print.html", "", "");
	printWin.onload = new function () {
		var timer = setTimeout(function (){printWindowLoaded(printWin, this)},200);
	}
}
function setWidths() {
	$(".container").css('width', $('html').width());
	if ($(this).width() >= 768) {
		$("#left-panel").css('width', 420+"px");
		$("#map-panel").css('width', ($('html').width() - 440)+"px");
		$(".footer").css('width', ($('html').width() - 50)+"px");
	}
	else {
		$("#left-panel").css('width', 'auto');
		$("#map-panel").css('width', 'auto');
		$(".footer").css('width', 'auto');
	}
	$(".container").show();
}
function addNoBufferOption () {
	if ($('#distance option[value="0"]').length === 0) {
		$("#distance").append('<option value="0" selected>Do Not Buffer</option>')
	}
}
function removeNoBufferOption () {
	$('#distance option[value="0"]').remove();
	$("#distance")[0].selectedIndex = 2;
}
function addDateToWhere (where) {
	var from = moment($('#fromDate').data("DateTimePicker").getDate().local()).format('YYYY/MM/DD'),
		to = moment($('#toDate').data("DateTimePicker").getDate().local()).format('YYYY/MM/DD'),
		fromTime = moment($("#fromTime").data("DateTimePicker").getDate().local()).format('HH:mm'),
		toTime = moment($("#toTime").data("DateTimePicker").getDate().local()).format('HH:mm');
	where += " AND dateofcrash  between '" + from +"' AND '"+ to + "'";
	if (parseInt(fromTime.replace(':', '')) > parseInt(toTime.replace(':', ''))) {
		where += " AND (cast(dateofcrash as time) between '" + fromTime + "' AND '23:59' OR cast(dateofcrash as time) between '0:00' and '" + toTime + "')";
	} else {
		where += " AND cast(dateofcrash as time) between '" + fromTime + "' AND '"+ toTime + "'";
	}
	var dowIndexes = [];
	$('.dow .active').each(function (i, day) {
		dowIndexes.push($(day).index() + 1);
	});
	where += " AND DATEPART(weekday, dateofcrash) in (" + dowIndexes.toString() + ")";
	return where;
}
function addTablesToSql (sql) {
	var views = ['vCrash'];
	$(whereArr).each(function (i, f) {
		if ($.inArray(f.view, views) == -1) {
			views.push(f.view);
		}
	});
	$(views).each(function (i, v) {
		sql += 'eCrash.dbo.' + v;
		if (i < views.length -1) {
			sql += ',';
		}
	})
	sql += ' WHERE ';
	if (views.length > 1) {
		$(views).each(function (i, v) {
			if (v.toLowerCase != 'vcrash') {
				sql += 'vCrash.key_crash = ' + v + '.key_crash AND ';
			}
		});
	}
	return sql;
}
function gotQueryResults (data) {
	var tbody = $("#list>tbody").empty();
	$("#list").show();
	markers.clearLayers();
	if (data.features) {
		var gj = L.geoJson(data, {
			onEachFeature: function (feature, layer) {
				addPopup(feature, layer);
				heatMap.addLatLng(feature.geometry.coordinates.reverse());
			}
		});
		lastGj = gj;
		buildTable(gj);
		markers.addLayer(gj);		
	}

}
function addPopup(feature, layer) {
	var text = '<strong>Case #  </strong>'+feature.properties['case']+'<br/>'+'<strong>Date  </strong>'+feature.properties['date']+'<br/>'+'<strong>Officer  </strong>'+feature.properties['officer']+'<br/>'+'<strong>Road On  </strong>'+feature.properties['roadon']+'<br/>'+'<strong>Road At  </strong>'+feature.properties['roadat']+'<br/>'+'<strong>Road To  </strong>'+feature.properties['roadto']+'<br/>'+addReportLink(feature.properties);
	layer.bindPopup(text);
}
function addReportLink (properties) {
	var date = moment(properties.date, 'MMM D YYYY  h:mmA'),
		url = "http://crash.raleighpd.org/files/" + date.format('YYYYMM') + "/" + date.format('YYYYMMDD') + properties.key + ".pdf";
	return '<a href="'+url+'" target="_blank">View Report</a>';
}
var lastGj;
function addResultsToTable (features) {
	var tbody = $("#list>tbody").empty(),
		lid = $("option:selected","#searchFor").index();
	$("#list").show();
	$(features).each(function (i, f) {
		var tr = $("<tr data-x='"+f.feature.geometry.coordinates[1]+"' data-y='"+f.feature.geometry.coordinates[0]+"'></tr>").appendTo(tbody).click(tableRowClicked);

		$(services.fields).each(function (i, fld) {

			tr.append("<td>" + f.feature.properties[fld.name] + "</td>");
		});
		tr.append("<td>" + addReportLink(f.feature.properties) + "</td>");
	});
}

function pageChanged (e, oldPage, newPage) {
	var rows = $("option:selected", "#results").val();
	addResultsToTable(lastGj.getLayers().slice(newPage*rows, (newPage + 1) * rows));
	if (newPage === 1) {
		$(".pagination").find("li").first().addClass("disabled");
	} else if (newPage === sheets || newPage === 50) {
		$(".pagination").find("li").last().removeClass("active").addClass("disabled");
	}
}
function buildTable (gj) {
	$("#list>tbody").empty();
	var rows = $("option:selected", "#results").val(),
		max = 10,
		lists = [];
	rows = (rows === "all") ?  gj.getLayers().length : rows;
	sheets = Math.ceil(gj.getLayers().length/rows)
	$("#pageDiv").show();
	$("#list").show();
	$("#paginator").bootstrapPaginator({currentPage: 1, totalPages: sheets, numberOfPages: 10,
                alignment:'center',
                onPageChanged: pageChanged,
                shouldShowPage:function(type, page, current){
                switch(type)
                {
                    case "first":
                    case "last":
                        return false;
                    default:
                        return true;
                }
            }});
	$("#paginator").click(function () {
		$("#paginator").removeClass("pagination").find("ul").addClass("pagination");
	});
	$("#paginator").removeClass("pagination").find("ul").addClass("pagination");
	lists = $(".pagination").find("li");
	lists.first().removeClass("active").addClass("disabled");
	if (lists.length < rows + 2) {
		lists.last().removeClass("active").addClass("disabled");
	}
	addResultsToTable(gj.getLayers().slice(0, rows));
}
function checkBoxChanged (e) {
	var obj = this;
	var cats = $(categories).filter(function () {
		return $("#categorySelect option:selected").data('value') === parseInt(this.id);
	})[0];
	var opts =$(cats.options).filter(function () {
		return $(obj).val() === this.id;
	})[0];
	var text = $("#categorySelect option:selected").val() + " = " + $(this.labels[0]).text();
	var li = $('<li>'+text+'</li>');
	if (this.checked) {
		$.each(cats.fields.split(','), function (i, f) {
			var matches = $(whereArr).filter(function () {
				return f === this.field;
			});
			var fld = {};
			if (matches.length === 0) {
				fld = {'view' : cats.view, 'field' : f, values: ["'" + $(obj).val() + "'"]};
				whereArr.push(fld);
			} else {
				matches[0].values.push("'" + $(obj).val() + "'");
			}
		});
		opts.selected = true;
		$("#queryString").append(li);
	} else {
		opts.selected = false;
		$("#queryString li:contains("+text+")").remove();

		$.each(cats.fields.split(','), function (i, f) {
			var matches = $(whereArr).filter(function () {
				return f === this.field;
			});
			var fld = {};
			if (matches.length > 0) {
				matches[0].values.splice($.inArray($(obj).val(), matches[0].values), 1);
			}
		});
	}
}

function buttonGroupChanged (e) {
	var obj = this;
	var cats = $(categories).filter(function () {
		return $("#categorySelect option:selected").data('value') === parseInt(this.id);
	})[0];
	var opts =$(cats.options).filter(function () {
		return $(obj).val() === this.id;
	})[0];
	opts.selected = (opts.selected) ? false : true;
	var text = $("#categorySelect option:selected").val() + " = " + $(this).text();
	var li = $('<li>'+text+'</li>');
	$.each(cats.fields.split(','), function (i, f) {
		var matches = $(whereArr).filter(function () {
			return f === this.field;
		});
		if (matches.length > 0) {
			whereArr.splice($.inArray(matches[0], whereArr), 1);
		}
			var fld = {'view': cats.view, 'field' : f, value: cats.view + '.' + f + " = '" + $(obj).val() + "'"};
			whereArr.push(fld);
	});
	$("#queryString li:contains("+$("#categorySelect option:selected").val()+")").remove();
	$("#queryString").append(li);
}

function addRangeQuery () {
	var cats = $(categories).filter(function () {
		return $("#categorySelect option:selected").data('value') === parseInt(this.id);
	})[0];
	cats.values = $("#rangeMin").val() + ',' + $("#rangeMax").val()
	var text = $("#categorySelect option:selected").val() + " between " + $("#rangeMin").val() + " AND " + $("#rangeMax").val();
	var li = $('<li>'+text+'</li>');
	$.each(cats.fields.split(','), function (i, f) {
		var matches = $(whereArr).filter(function () {
			return f === this.field;
		});
		if (matches.length > 0) {
			whereArr.splice($.inArray(matches[0], whereArr), 1);
		}
			var fld = {'view': cats.view, 'field' : f, value: cats.view + '.' + f + ' BETWEEN ' + $("#rangeMin").val()  + ' AND ' + $("#rangeMax").val() };
			whereArr.push(fld);
	});
	$("#queryString li:contains("+$("#categorySelect option:selected").val()+")").remove();
	$("#queryString").append(li);
}
function removeQuery () {
	$("#queryString li:contains("+$("#categorySelect option:selected").val()+")").remove();
	$("#categoryArea .btn-group label").removeClass('active');
	$("#categoryArea :checkbox").prop('checked', false);
	var ids = [];
	whereArr = $.grep(whereArr, function (value) {
		return $("#categorySelect option:selected").data('fields').toString().indexOf(value.field) === -1;
	});
	var cat = $(categories).filter(function () {
		return this.fields.indexOf($("#categorySelect option:selected").data('fields')) > -1;
	});
	if (cat.length > 0) {
		if (cat[0].options) {
			$.each(cat[0].options, function (i, o) {
				o.selected = false;
			});
		}
	}
}

function clearQuery () {
	$("#queryString").empty();
	$("#categoryArea .btn-group label").removeClass('active');
	$("#categoryArea :checkbox").prop('checked', false);	
	whereArr = [];
	$(categories).each(function (i, cat) {
		if (cat.options) {
			$.each(cat.options, function (i, o) {
				o.selected = false;
			});
		}
	});
}

function categorySelected () {
	var selection = $('option:selected', this);
	$('#categoryArea').empty();
	var cats = $(categories).filter(function () {
		return selection.data('value') === parseInt(this.id);
	});
	if (cats.length > 0) {
		var cat = cats[0];
		if (cat.type === 'checkbox') {
			$(cat.options).each(function (i, o) {
				$("#categoryArea").append($("<div></div>")
					.append($("<input></input>")
					.attr("type",cat.type).attr("name","optionInput")
					.attr("value",o.id)
					.attr("id","cb"+o.id)
					.prop("checked", o.selected)
					.css("cursor", "pointer")))
					.append($("<label></label>")
					.attr("for","cb"+o.id)
					.html(o.value));
			});
		} else if (cat.type === 'radio') {
			var grp = $("<div class='btn-group' data-toggle='buttons'></div>").appendTo('#categoryArea');
			$(cat.options).each(function (i, o) {
				var lbl = $('<label class="btn btn-primary">').appendTo(grp).val(o.id);
				var radio = $('<input type="radio">' + o.value + '</input>').appendTo(lbl);
				(o.selected) ? lbl.addClass('active') : lbl.removeClass('active');

			});
			$('label', grp).change(buttonGroupChanged);
		} else if (cat.type === 'slider') {
			$('<div><input id="rangeMin" class="form-control" value="'+cat.values.split(',')[0]+'" type="number"/>to <input id="rangeMax" class="form-control" value="'+cat.values.split(',')[1]+'"/></div>').appendTo("#categoryArea");
			var addBtn = $('<button class="btn btn-default" style="margin-top: 10px; width: 100%">Add To Query</button>')
				.appendTo("#categoryArea")
				.click(addRangeQuery);
		}
			var rmBtn = $('<button class="btn btn-default" style="margin-top: 10px; width: 100%">Remove From Query</button>')
				.appendTo("#categoryArea")
				.click(removeQuery);
		$(":checkbox").click(checkBoxChanged);
	}
}
function getCrashCodes () {
	$.getJSON("codes.json", function (data) {
		categories = data;
		$(data).each(function (i, c) {
				$("#categorySelect").append($("<option></option>")
				.attr('data-value',c.id)
				.attr('data-fields', c.fields)
				.attr('data-view',c.view)
				.text(c.category));
		});
		$("#categorySelect").change(categorySelected);
	});
}
function submitNonStandardQuery () {
	var sql = " FROM ";
	sql = addTablesToSql(sql);
	$.each(whereArr, function (i, f) {
		if (i > 0) {
			sql += " AND ";
		}
		if (f.values) {
			if (f.values.length > 0) {
				sql += f.view + '.' + f.field + " IN (" + f.values.toString() + ")";
			}
		} else {
			sql += f.value;
		}
	});
	sql = addDateToWhere(sql);
	sql += ' ORDER BY vCrash.dateofcrash DESC';
	$(".progress").show();
	$.ajax({url: 'php/crash.php',
		dataType: 'jsonp',
		data: {
			where: sql
		}
	}).done(gotQueryResults)
	.always(function () {
		$(".progress").hide();
	});
}
function submitStandardQuery () {
	if ($('#querySelect option:selected').index() > 0 ) {
		var sql = "";
		sql = addDateToWhere(sql);
		sql += ' ORDER BY c.dateofcrash DESC';
		$(".progress").show();
		$.ajax({url: 'php/crash_standard.php',
			dataType: 'jsonp',
			data: {
				queryid: $('#querySelect option:selected').val(),
				where: sql
			}
		}).done(gotQueryResults)
		.always(function () {
			$(".progress").hide();
		});
	}
}
function init() {
	getCrashCodes();
	$('#queryType').change(function () {
		$('#nonStandardDiv').toggle();
		$('#standardDiv').toggle();
	});
	$('#searchBtn').click(function () {
		if ($('#queryType option:selected').index() === 0) {
			submitStandardQuery();
		} else {
			submitNonStandardQuery();
		}
	});
	setWidths();
	setAddressTypeAhead();
	setIntersectionTypeAhead();
	setLocationForm();
	setDateSearch();
	setTimeSearch();
	setMap();
	$("#print").click(print);
	$("#export").click(exportTable);
	$("#distance").change(function () {
		if (lastFeature) {
			bufferLocation(lastFeature);
		}
	});
	$("#clearButton").click(clearQuery);

	$("#results").change(function () {
		if (lastGj) {
			buildTable(lastGj);
		}
	});
	$(window).resize(setWidths);
}
$(document).ready(init);