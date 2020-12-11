function autoIndent2 (arg)

    if(cond)  
        print "has cond"; cond
        if(cond2)then print "has cond2"; cond2
    elseif (cond2) then
        print "cond2"; cond2
    elseif(cond3)then  
        print "cond3"; cond3
    else
        print "not cond"; cond
    endif

    p = {  
        x: 100,
        y: 100,
        fn:function(arg)
            print "is p.fn"
        end function
    }

    fn=sub ()
        print "is fn"
    endsub

    for i = 0 to 10 step 2
        print "i="; i
    endfor
endfunction
