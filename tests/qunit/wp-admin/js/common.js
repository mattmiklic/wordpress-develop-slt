/* global sinon */
jQuery( function() {
	const content = document.getElementById( 'wpbody-content' );
	const tableMarkup = '<table class="wp-list-table"><tbody><tr><td>Post title</td></tr></tbody></table>';
	const wrapperMarkup = '<div class="wp-list-table-scroll" tabindex="0">' + tableMarkup + '</div>';

	function overflow( wrapper ) {
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

	const initialOverflow = overflow( content.firstElementChild );

	QUnit.module( 'List table scroll controls', {
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

	QUnit.test( 'Initializes overflow indicators for tables present on page load', function( assert ) {
		assert.deepEqual( initialOverflow, [ false, true ], 'Only the end has hidden content on page load.' );
	} );

	QUnit.test( 'Creates native buttons with accessible labels', function( assert ) {
		const wrapper = this.wrapper;
		const labels = [ 'Scroll to previous columns', 'Scroll to next columns' ];

		[ 'start', 'end' ].forEach( function( edge, index ) {
			const button = wrapper.querySelector( '.wp-list-table-scroll-edge-' + edge ).firstElementChild;
			assert.strictEqual( button.tagName, 'BUTTON', 'The ' + edge + ' control is a native button.' );
			assert.strictEqual( button.type, 'button', 'The control does not submit a form.' );
			assert.strictEqual( button.getAttribute( 'aria-label' ), labels[ index ], 'The button identifies its scroll direction.' );
			assert.strictEqual( button.title, labels[ index ], 'The tooltip matches the accessible label.' );
			assert.strictEqual( button.firstElementChild.getAttribute( 'aria-hidden' ), 'true', 'The decorative icon is hidden from assistive technology.' );
		} );
	} );

	[ 'ltr', 'rtl' ].forEach( function( direction ) {
		QUnit.test( 'Scrolls by a viewport with overlap in ' + direction, async function( assert ) {
			const wrapper = this.wrapper;
			const sign = direction === 'rtl' ? -1 : 1;
			const previous = wrapper.querySelector( '.wp-list-table-scroll-edge-start button' );
			const next = wrapper.querySelector( '.wp-list-table-scroll-edge-end button' );
			this.sandbox.stub( window, 'matchMedia' ).callThrough()
				.withArgs( '(prefers-reduced-motion: reduce)' ).returns( { matches: true } );
			wrapper.dir = direction;
			this.table.style.width = '2400px';
			await afterResize();
			scrollTo( wrapper, 0 );

			next.click();
			assert.strictEqual( wrapper.scrollLeft, sign * 736, 'Next advances through the 800px viewport with 64px of overlap.' );

			next.click();
			assert.strictEqual( wrapper.scrollLeft, sign * 1472, 'Another click advances from the current position.' );

			previous.click();
			assert.strictEqual( wrapper.scrollLeft, sign * 736, 'Previous reverses the scroll direction.' );
		} );

		QUnit.test( 'Updates both overflow indicators when scrolling in ' + direction, function( assert ) {
			const wrapper = this.wrapper;
			const sign = direction === 'rtl' ? -1 : 1;
			wrapper.dir = direction;

			scrollTo( wrapper, 0 );
			assert.deepEqual( overflow( wrapper ), [ false, true ], 'Only the end has hidden content at the start.' );

			scrollTo( wrapper, sign * 200 );
			assert.deepEqual( overflow( wrapper ), [ true, true ], 'Both ends have hidden content in the middle.' );

			scrollTo( wrapper, sign * 400 );
			assert.deepEqual( overflow( wrapper ), [ true, false ], 'Only the start has hidden content at the end.' );

			scrollTo( wrapper, 0 );
			assert.deepEqual( overflow( wrapper ), [ false, true ], 'Returning to the start clears its overflow indicator.' );
		} );

		QUnit.test( 'Handles fractional positions and elastic overscroll in ' + direction, function( assert ) {
			const wrapper = this.wrapper;
			const sign = direction === 'rtl' ? -1 : 1;
			wrapper.dir = direction;

			// Supply positions that not all browsers expose at the default zoom level.
			Object.defineProperty( wrapper, 'scrollLeft', { configurable: true, writable: true, value: 0 } );

			scrollTo( wrapper, sign * 0.5 );
			assert.deepEqual( overflow( wrapper ), [ false, true ], 'A fractional offset at the start does not show an overflow indicator.' );

			scrollTo( wrapper, sign * 1.5 );
			assert.deepEqual( overflow( wrapper ), [ true, true ], 'Content beyond the tolerance shows the start overflow indicator.' );

			scrollTo( wrapper, sign * 398.5 );
			assert.deepEqual( overflow( wrapper ), [ true, true ], 'Content beyond the tolerance shows the end overflow indicator.' );

			scrollTo( wrapper, sign * 399.5 );
			assert.deepEqual( overflow( wrapper ), [ true, false ], 'A fractional offset at the end does not show an overflow indicator.' );

			scrollTo( wrapper, sign * -20 );
			assert.deepEqual( overflow( wrapper ), [ false, true ], 'Overscrolling past the start does not show a start overflow indicator.' );

			scrollTo( wrapper, sign * 420 );
			assert.deepEqual( overflow( wrapper ), [ true, false ], 'Overscrolling past the end does not show an end overflow indicator.' );

			this.table.style.width = '600px';
			wrapper.dispatchEvent( new Event( 'scroll' ) );
			assert.deepEqual( overflow( wrapper ), [ false, false ], 'A fitting table has no overflow indicators even with a stale scroll offset.' );
		} );
	} );

	QUnit.test( 'Uses the current reduced-motion preference for button scrolling', function( assert ) {
		const scrollBy = this.sandbox.stub( this.wrapper, 'scrollBy' );
		const preference = { matches: false };
		const next = this.wrapper.querySelector( '.wp-list-table-scroll-edge-end button' );
		this.sandbox.stub( window, 'matchMedia' ).callThrough()
			.withArgs( '(prefers-reduced-motion: reduce)' ).returns( preference );

		next.click();
		assert.deepEqual( scrollBy.firstCall.args, [ { left: 736, behavior: 'smooth' } ], 'Scrolling is smooth without reduced motion.' );

		preference.matches = true;
		next.click();
		assert.deepEqual( scrollBy.secondCall.args, [ { left: 736, behavior: 'instant' } ], 'Enabling reduced motion makes the next scroll immediate.' );
	} );

	QUnit.test( 'Returns focus to the wrapper when a focused control disappears', async function( assert ) {
		const wrapper = this.wrapper;

		[ 'start', 'end' ].forEach( function( edge ) {
			const button = wrapper.querySelector( '.wp-list-table-scroll-edge-' + edge + ' button' );
			scrollTo( wrapper, 200 );
			button.focus( { preventScroll: true } );
			assert.strictEqual( document.activeElement, button, 'The ' + edge + ' control receives keyboard focus.' );

			scrollTo( wrapper, 250 );
			assert.strictEqual( document.activeElement, button, 'Focus stays on a control while its edge still overflows.' );

			scrollTo( wrapper, edge === 'start' ? 0 : 400 );
			assert.strictEqual( document.activeElement, wrapper, 'Focus returns to the wrapper at the ' + edge + ' boundary.' );
		} );

		scrollTo( wrapper, 0 );
		wrapper.querySelector( '.wp-list-table-scroll-edge-end button' ).focus( { preventScroll: true } );
		this.table.style.width = '600px';
		await afterResize();
		assert.strictEqual( document.activeElement, wrapper, 'Removing overflow on resize also returns focus to the wrapper.' );
	} );

	QUnit.test( 'Centers icons in the visible area below the admin toolbar', async function( assert ) {
		const button = this.wrapper.querySelector( '.wp-list-table-scroll-edge-start button' );
		const bounds = this.sandbox.stub( button, 'getBoundingClientRect' );
		// Supply viewport bounds independently of the off-screen fixture.
		this.sandbox.stub( window, 'innerHeight' ).value( 600 );
		this.sandbox.stub( document.getElementById( 'wpadminbar' ), 'getBoundingClientRect' )
			.returns( new window.DOMRect( 0, 0, 800, 32 ) );

		bounds.returns( new window.DOMRect( 0, 100, 32, 1000 ) );
		window.dispatchEvent( new Event( 'scroll' ) );
		await afterResize();
		assert.strictEqual( this.wrapper.style.getPropertyValue( '--wp-list-table-scroll-icon-top' ), '240px', 'The icon is centered in the visible part of a tall table.' );

		bounds.returns( new window.DOMRect( 0, -100, 32, 1000 ) );
		window.dispatchEvent( new Event( 'scroll' ) );
		await afterResize();
		assert.strictEqual( this.wrapper.style.getPropertyValue( '--wp-list-table-scroll-icon-top' ), '406px', 'Page scrolling keeps the icon below the toolbar and within the viewport.' );
	} );

	QUnit.test( 'Updates overflow indicators when the table or its viewport changes width', async function( assert ) {
		this.table.style.width = '600px';
		await afterResize();
		assert.deepEqual( overflow( this.wrapper ), [ false, false ], 'Shrinking the table clears the overflow indicator without a scroll event.' );

		this.wrapper.style.width = '400px';
		await afterResize();
		assert.deepEqual( overflow( this.wrapper ), [ false, true ], 'Shrinking the viewport reveals overflow without a scroll event.' );

		this.wrapper.style.width = '800px';
		await afterResize();
		assert.deepEqual( overflow( this.wrapper ), [ false, false ], 'Widening the viewport clears the overflow indicator.' );
	} );

	QUnit.test( 'Cleans up a replaced wrapper and initializes its replacement', async function( assert ) {
		const oldWrapper = this.wrapper;
		const disconnect = this.sandbox.spy( window.ResizeObserver.prototype, 'disconnect' );
		scrollTo( oldWrapper, 200 );

		content.innerHTML = wrapperMarkup;
		// Preserve overflow outside the observed content to expose a leaked scroll listener.
		document.getElementById( 'qunit-fixture' ).appendChild( oldWrapper );
		await afterResize();
		assert.deepEqual( overflow( content.firstElementChild ), [ false, true ], 'The replacement is initialized.' );
		assert.deepEqual( overflow( oldWrapper ), [ false, false ], 'The old wrapper loses its overflow indicators.' );
		assert.strictEqual( oldWrapper.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 0, 'The old controls are removed.' );
		assert.strictEqual( oldWrapper.style.getPropertyValue( '--wp-list-table-scroll-icon-top' ), '', 'The old icon position is cleared.' );
		assert.strictEqual( content.firstElementChild.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 2, 'The replacement has one pair of controls.' );
		assert.strictEqual( disconnect.callCount, 1, 'The old resize observer is disconnected.' );

		scrollTo( oldWrapper, 200 );
		assert.deepEqual( overflow( oldWrapper ), [ false, false ], 'Scrolling the removed wrapper no longer updates overflow indicators.' );

		scrollTo( content.firstElementChild, 200 );
		assert.deepEqual( overflow( content.firstElementChild ), [ true, true ], 'The replacement responds to scrolling.' );
	} );

	QUnit.test( 'Tracks a replacement table without duplicating observers for other mutations', async function( assert ) {
		const observe = this.sandbox.spy( window.ResizeObserver.prototype, 'observe' );
		const disconnect = this.sandbox.spy( window.ResizeObserver.prototype, 'disconnect' );

		this.table.querySelector( 'td' ).textContent = 'Updated post title';
		await Promise.resolve();
		assert.notOk( observe.called, 'Changing a row does not add another resize observer.' );
		assert.notOk( disconnect.called, 'Changing a row retains the existing observer.' );
		assert.strictEqual( this.wrapper.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 2, 'Changing a row does not duplicate controls.' );

		this.wrapper.innerHTML = tableMarkup;
		await afterResize();
		assert.strictEqual( disconnect.callCount, 1, 'Replacing the table disconnects its old observer.' );
		assert.strictEqual( observe.callCount, 2, 'The new observer watches the table and its wrapper.' );
		assert.strictEqual( this.wrapper.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 2, 'Replacing the table creates one pair of controls.' );

		this.wrapper.firstElementChild.style.width = '600px';
		await afterResize();
		assert.deepEqual( overflow( this.wrapper ), [ false, false ], 'Resizing the replacement table updates its overflow indicators.' );
	} );

	QUnit.test( 'Moves scroll controls when a table moves to another wrapper', async function( assert ) {
		const oldWrapper = this.wrapper;
		const newWrapper = document.createElement( 'div' );
		newWrapper.className = 'wp-list-table-scroll';
		scrollTo( oldWrapper, 200 );

		content.appendChild( newWrapper );
		newWrapper.appendChild( this.table );
		await afterResize();
		assert.deepEqual( overflow( oldWrapper ), [ false, false ], 'The old wrapper loses its overflow indicators.' );
		assert.deepEqual( overflow( newWrapper ), [ false, true ], 'The new wrapper is initialized.' );
		assert.strictEqual( oldWrapper.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 0, 'The old wrapper loses its controls.' );
		assert.strictEqual( newWrapper.querySelectorAll( '.wp-list-table-scroll-edge' ).length, 2, 'The new wrapper has one pair of controls.' );

		scrollTo( newWrapper, 200 );
		assert.deepEqual( overflow( newWrapper ), [ true, true ], 'The new wrapper responds to scrolling.' );
	} );

	QUnit.start();
} );
