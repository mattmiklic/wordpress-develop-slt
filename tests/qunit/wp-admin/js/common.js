/* global sinon */
jQuery( function() {
	const content = document.getElementById( 'wpbody-content' );
	const tableMarkup = '<table class="wp-list-table"><tbody><tr><td>Post title</td></tr></tbody></table>';
	const wrapperMarkup = '<div class="wp-list-table-scroll">' + tableMarkup + '</div>';

	function shadows( wrapper ) {
		return [
			wrapper.classList.contains( 'has-scroll-overflow-start' ),
			wrapper.classList.contains( 'has-scroll-overflow-end' )
		];
	}

	function scrollTo( wrapper, position ) {
		wrapper.scrollLeft = position;
		wrapper.dispatchEvent( new Event( 'scroll' ) );
	}

	function afterResize() {
		// ResizeObserver delivers changes after animation callbacks, before the next frame.
		return new Promise( function( resolve ) {
			window.requestAnimationFrame( function() {
				window.requestAnimationFrame( resolve );
			} );
		} );
	}

	const initialShadows = shadows( content.firstElementChild );

	QUnit.module( 'List table scroll shadows', {
		beforeEach: async function() {
			this.sandbox = sinon.createSandbox();
			content.innerHTML = wrapperMarkup;
			this.wrapper = content.firstElementChild;
			this.table = this.wrapper.firstElementChild;
			await afterResize();
		},
		afterEach: async function() {
			content.replaceChildren();
			// Allow the mutation observer to clean up before restoring spies.
			await Promise.resolve();
			this.sandbox.restore();
		}
	} );

	QUnit.test( 'Initializes shadows for tables present on page load', function( assert ) {
		assert.deepEqual( initialShadows, [ false, true ], 'Only the end has hidden content on page load.' );
	} );

	[ 'ltr', 'rtl' ].forEach( function( direction ) {
		QUnit.test( 'Updates both shadows when scrolling in ' + direction, function( assert ) {
			const wrapper = this.wrapper;
			const sign = direction === 'rtl' ? -1 : 1;
			wrapper.dir = direction;

			scrollTo( wrapper, 0 );
			assert.deepEqual( shadows( wrapper ), [ false, true ], 'Only the end has hidden content at the start.' );

			scrollTo( wrapper, sign * 200 );
			assert.deepEqual( shadows( wrapper ), [ true, true ], 'Both ends have hidden content in the middle.' );

			scrollTo( wrapper, sign * 400 );
			assert.deepEqual( shadows( wrapper ), [ true, false ], 'Only the start has hidden content at the end.' );

			scrollTo( wrapper, 0 );
			assert.deepEqual( shadows( wrapper ), [ false, true ], 'Returning to the start clears its shadow.' );
		} );

		QUnit.test( 'Handles fractional positions and elastic overscroll in ' + direction, function( assert ) {
			const wrapper = this.wrapper;
			const sign = direction === 'rtl' ? -1 : 1;
			wrapper.dir = direction;

			// Supply positions that not all browsers expose at the default zoom level.
			Object.defineProperty( wrapper, 'scrollLeft', { configurable: true, writable: true, value: 0 } );

			scrollTo( wrapper, sign * 0.5 );
			assert.deepEqual( shadows( wrapper ), [ false, true ], 'A fractional offset at the start does not show a shadow.' );

			scrollTo( wrapper, sign * 1.5 );
			assert.deepEqual( shadows( wrapper ), [ true, true ], 'Content beyond the tolerance shows the start shadow.' );

			scrollTo( wrapper, sign * 398.5 );
			assert.deepEqual( shadows( wrapper ), [ true, true ], 'Content beyond the tolerance shows the end shadow.' );

			scrollTo( wrapper, sign * 399.5 );
			assert.deepEqual( shadows( wrapper ), [ true, false ], 'A fractional offset at the end does not show a shadow.' );

			scrollTo( wrapper, sign * -20 );
			assert.deepEqual( shadows( wrapper ), [ false, true ], 'Overscrolling past the start does not show a start shadow.' );

			scrollTo( wrapper, sign * 420 );
			assert.deepEqual( shadows( wrapper ), [ true, false ], 'Overscrolling past the end does not show an end shadow.' );

			this.table.style.width = '600px';
			wrapper.dispatchEvent( new Event( 'scroll' ) );
			assert.deepEqual( shadows( wrapper ), [ false, false ], 'A fitting table has no shadows even with a stale scroll offset.' );
		} );
	} );

	QUnit.test( 'Updates shadows when the table or its viewport changes width', async function( assert ) {
		this.table.style.width = '600px';
		await afterResize();
		assert.deepEqual( shadows( this.wrapper ), [ false, false ], 'Shrinking the table clears the shadow without a scroll event.' );

		this.wrapper.style.width = '400px';
		await afterResize();
		assert.deepEqual( shadows( this.wrapper ), [ false, true ], 'Shrinking the viewport reveals overflow without a scroll event.' );

		this.wrapper.style.width = '800px';
		await afterResize();
		assert.deepEqual( shadows( this.wrapper ), [ false, false ], 'Widening the viewport clears the shadow.' );
	} );

	QUnit.test( 'Cleans up a replaced wrapper and initializes its replacement', async function( assert ) {
		const oldWrapper = this.wrapper;
		const disconnect = this.sandbox.spy( window.ResizeObserver.prototype, 'disconnect' );
		scrollTo( oldWrapper, 200 );

		content.innerHTML = wrapperMarkup;
		// Preserve overflow outside the observed content to expose a leaked scroll listener.
		document.getElementById( 'qunit-fixture' ).appendChild( oldWrapper );
		await afterResize();
		assert.deepEqual( shadows( content.firstElementChild ), [ false, true ], 'The replacement is initialized.' );
		assert.deepEqual( shadows( oldWrapper ), [ false, false ], 'The old wrapper loses its shadows.' );
		assert.strictEqual( disconnect.callCount, 1, 'The old resize observer is disconnected.' );

		scrollTo( oldWrapper, 200 );
		assert.deepEqual( shadows( oldWrapper ), [ false, false ], 'Scrolling the removed wrapper no longer updates shadows.' );

		scrollTo( content.firstElementChild, 200 );
		assert.deepEqual( shadows( content.firstElementChild ), [ true, true ], 'The replacement responds to scrolling.' );
	} );

	QUnit.test( 'Tracks a replacement table without duplicating observers for other mutations', async function( assert ) {
		const observe = this.sandbox.spy( window.ResizeObserver.prototype, 'observe' );
		const disconnect = this.sandbox.spy( window.ResizeObserver.prototype, 'disconnect' );

		this.table.querySelector( 'td' ).textContent = 'Updated post title';
		await Promise.resolve();
		assert.notOk( observe.called, 'Changing a row does not add another resize observer.' );
		assert.notOk( disconnect.called, 'Changing a row retains the existing observer.' );

		this.wrapper.innerHTML = tableMarkup;
		await afterResize();
		assert.strictEqual( disconnect.callCount, 1, 'Replacing the table disconnects its old observer.' );
		assert.strictEqual( observe.callCount, 2, 'The new observer watches the table and its wrapper.' );

		this.wrapper.firstElementChild.style.width = '600px';
		await afterResize();
		assert.deepEqual( shadows( this.wrapper ), [ false, false ], 'Resizing the replacement table updates its shadows.' );
	} );

	QUnit.test( 'Moves shadow tracking when a table moves to another wrapper', async function( assert ) {
		const oldWrapper = this.wrapper;
		const newWrapper = document.createElement( 'div' );
		newWrapper.className = 'wp-list-table-scroll';
		scrollTo( oldWrapper, 200 );

		content.appendChild( newWrapper );
		newWrapper.appendChild( this.table );
		await afterResize();
		assert.deepEqual( shadows( oldWrapper ), [ false, false ], 'The old wrapper loses its shadows.' );
		assert.deepEqual( shadows( newWrapper ), [ false, true ], 'The new wrapper is initialized.' );

		scrollTo( newWrapper, 200 );
		assert.deepEqual( shadows( newWrapper ), [ true, true ], 'The new wrapper responds to scrolling.' );
	} );

	QUnit.start();
} );
